/**
 * The agent "brain": everything that runs around an agent once the user is authenticated.
 *
 *   rate limit (Redis) -> session -> recall memory -> cache check -> run agent
 *   -> drop fake/unverifiable results -> grounded LLM brief (or deterministic brief)
 *   -> remember sourced findings -> cache
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheBackend, cacheGet, cacheSet, hashKey, rateLimit } from '../cache/redis';
import { llmComplete, parseJsonObject } from '../llm/router';
import { formatMemoryForPrompt, getOrCreateSession, recallMemories, rememberMemory } from '../memory/agent-memory';
import { buildEvidence, deterministicBrief, evidenceBlock, filterRealResults, GROUNDING_RULES, groundBrief, type GroundedBrief } from './grounding';
import { runAgent, type AgentRunInput } from './runtime';

export type BrainInput = {
  supabase: SupabaseClient;
  userId: string;
  companyId: string;
  employeeRole: string;
  agent: AgentRunInput['agent'];
  title: string;
  instructions: string;
};

export type BrainOutcome =
  | { ok: true; payload: Record<string, unknown>; cached: boolean }
  | { ok: false; status: number; error: string };

const RESULT_CACHE_SECONDS = 600;

function agentFailure(result: unknown): string | null {
  const status = typeof (result as { status?: unknown })?.status === 'number' ? (result as { status: number }).status : 200;
  if (status < 400) return null;
  const body = (result as { body?: { error?: unknown } }).body;
  return typeof body?.error === 'string' ? body.error : `The agent could not complete this task (status ${status}).`;
}

async function writeBrief(query: string, evidence: ReturnType<typeof buildEvidence>, memoryText: string, companyId: string): Promise<{ brief: GroundedBrief; model: string | null; llmErrors: string[] }> {
  if (!evidence.length) return { brief: deterministicBrief(query, evidence), model: null, llmErrors: [] };
  const outcome = await llmComplete({
    json: true,
    maxTokens: 700,
    temperature: 0.1,
    cacheTtlSeconds: RESULT_CACHE_SECONDS,
    cacheNamespace: companyId,
    messages: [
      { role: 'system', content: `${GROUNDING_RULES} Reply with JSON only: {"summary": string, "picks": [{"evidence_id": "E1", "why": string, "next_step": string}]}. At most 4 picks.` },
      { role: 'user', content: `Request: ${query}\n\n${evidenceBlock(evidence)}\n\n${memoryText}` },
    ],
  });
  if (!outcome.ok) return { brief: deterministicBrief(query, evidence), model: null, llmErrors: outcome.errors };
  const parsed = parseJsonObject(outcome.text);
  const grounded = groundBrief(parsed, evidence);
  if (!grounded) return { brief: deterministicBrief(query, evidence), model: null, llmErrors: ['The model did not return a usable grounded answer.'] };
  return { brief: grounded, model: `${outcome.provider}/${outcome.model}`, llmErrors: [] };
}

export async function runAgentWithBrain(input: BrainInput): Promise<BrainOutcome> {
  const limit = Number(process.env.AGENT_RATE_LIMIT_PER_HOUR || 30);
  const limited = await rateLimit(`rate:agent:${input.userId}`, limit, 3600);
  if (!limited.allowed) return { ok: false, status: 429, error: `You have reached the limit of ${limit} agent runs per hour. Try again later.` };

  const query = input.instructions ? `${input.title}\n\n${input.instructions}` : input.title;
  const cacheKey = `agent:${input.companyId}:${input.agent}:${await hashKey(query.toLowerCase().trim())}`;
  const cachedRaw = await cacheGet(cacheKey);
  if (cachedRaw) {
    try {
      return { ok: true, payload: { ...(JSON.parse(cachedRaw) as Record<string, unknown>), cacheHit: true }, cached: true };
    } catch {
      /* ignore a corrupt cache entry */
    }
  }

  const [sessionId, memories] = await Promise.all([
    getOrCreateSession(input.supabase, { companyId: input.companyId, userId: input.userId, employeeRole: input.employeeRole, title: input.title }),
    recallMemories(input.supabase, { companyId: input.companyId, employeeRole: input.employeeRole }),
  ]);

  const result = await runAgent({ accountId: input.companyId, userId: input.userId }, { agent: input.agent, query, limit: 20 });
  const failure = agentFailure(result);
  if (failure) return { ok: false, status: 502, error: failure };

  const body = (result && typeof result === 'object' && 'body' in result ? (result as { body: unknown }).body : result) as Record<string, unknown> | null;
  const payload: Record<string, unknown> = { ...(body ?? {}) };
  const rawResults = Array.isArray(payload.results) ? (payload.results as unknown[]) : null;

  let brief: GroundedBrief | null = null;
  let model: string | null = null;
  let llmErrors: string[] = [];
  let kept: Array<Record<string, unknown>> = [];

  if (rawResults) {
    const filtered = filterRealResults(rawResults);
    kept = filtered.kept;
    payload.results = kept;
    payload.verification = { received: rawResults.length, kept: kept.length, dropped: filtered.dropped.slice(0, 20), rule: 'Only results with a named source and a real URL, phone or address are shown.' };
    const evidence = buildEvidence(kept);
    const written = await writeBrief(query, evidence, formatMemoryForPrompt(memories), input.companyId);
    brief = written.brief;
    model = written.model;
    llmErrors = written.llmErrors;
    payload.brief = brief;
    if (!model && !brief.usedModel) payload.message = brief.summary;
    else payload.message = brief.summary;
  }

  payload.engine = { model, llmErrors, cache: cacheBackend(), memoriesRecalled: memories.length, sessionId };

  // Remember only what has a source behind it.
  const saves: Array<Promise<boolean>> = [];
  for (const pick of brief?.picks.slice(0, 3) ?? []) {
    if (!pick.url) continue;
    saves.push(rememberMemory(input.supabase, { companyId: input.companyId, userId: input.userId, employeeRole: input.employeeRole, sessionId, kind: 'finding', content: `${pick.name}: ${pick.why}`, sourceUrl: pick.url, importance: 3, ttlDays: 90 }));
  }
  saves.push(rememberMemory(input.supabase, { companyId: input.companyId, userId: input.userId, employeeRole: input.employeeRole, sessionId, kind: 'outcome', content: `Task "${input.title.slice(0, 100)}" returned ${kept.length} verified result${kept.length === 1 ? '' : 's'}.`, importance: 2, ttlDays: 30 }));
  await Promise.all(saves);

  if (!rawResults || kept.length) await cacheSet(cacheKey, JSON.stringify(payload), RESULT_CACHE_SECONDS);
  return { ok: true, payload, cached: false };
}
