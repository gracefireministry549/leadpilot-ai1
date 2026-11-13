/**
 * Multi-provider LLM router with ordered fallback.
 *
 * Providers (set the matching key as a server-side secret to enable each one):
 *   groq        GROQ_API_KEY        OpenAI-compatible, has a free tier
 *   gemini      GEMINI_API_KEY      Google AI Studio, has a free tier
 *   openrouter  OPENROUTER_API_KEY  routes to many models, some ":free"
 *   xai         XAI_API_KEY         xAI Grok (paid API)
 * Order defaults to groq, gemini, openrouter, xai. Override with LLM_PROVIDER_ORDER="gemini,groq".
 * Models are configurable with GROQ_MODEL, GEMINI_MODEL, OPENROUTER_MODEL and XAI_MODEL.
 */
import { cacheGet, cacheSet, hashKey } from '../cache/redis';

type Env = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export type LlmProviderId = 'groq' | 'gemini' | 'openrouter' | 'xai';
export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LlmRequest = {
  messages: LlmMessage[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** When set, successful answers are cached in Redis for this many seconds. */
  cacheTtlSeconds?: number;
  cacheNamespace?: string;
};
export type LlmOutcome =
  | { ok: true; provider: LlmProviderId; model: string; text: string; cached?: boolean }
  | { ok: false; errors: string[] };

type ProviderConfig = { id: LlmProviderId; key: string; model: string };

const DEFAULT_ORDER: LlmProviderId[] = ['groq', 'gemini', 'openrouter', 'xai'];
const DEFAULT_MODELS: Record<LlmProviderId, string> = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  xai: 'grok-4-fast',
};
const KEY_VARS: Record<LlmProviderId, string> = { groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', xai: 'XAI_API_KEY' };
const MODEL_VARS: Record<LlmProviderId, string> = { groq: 'GROQ_MODEL', gemini: 'GEMINI_MODEL', openrouter: 'OPENROUTER_MODEL', xai: 'XAI_MODEL' };
const OPENAI_BASES: Partial<Record<LlmProviderId, string>> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  xai: 'https://api.x.ai/v1',
};

export function configuredLlmProviders(env: Env = process.env): ProviderConfig[] {
  const requested = (env.LLM_PROVIDER_ORDER ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is LlmProviderId => (DEFAULT_ORDER as string[]).includes(item));
  const order = [...new Set([...requested, ...DEFAULT_ORDER])];
  const providers: ProviderConfig[] = [];
  for (const id of order) {
    const key = env[KEY_VARS[id]]?.trim();
    if (key) providers.push({ id, key, model: env[MODEL_VARS[id]]?.trim() || DEFAULT_MODELS[id] });
  }
  return providers;
}

export function llmConfigured(env: Env = process.env): boolean {
  return configuredLlmProviders(env).length > 0;
}

async function callOpenAiCompatible(provider: ProviderConfig, request: LlmRequest, fetchImpl: FetchLike): Promise<string> {
  const base = OPENAI_BASES[provider.id]!;
  const response = await fetchImpl(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${provider.key}`,
      'content-type': 'application/json',
      ...(provider.id === 'openrouter' ? { 'x-title': 'LeadPilot AI' } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 900,
      ...(request.json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty response');
  return text;
}

async function callGemini(provider: ProviderConfig, request: LlmRequest, fetchImpl: FetchLike): Promise<string> {
  const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
  const contents = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': provider.key, 'content-type': 'application/json' },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.2,
        maxOutputTokens: request.maxTokens ?? 900,
        ...(request.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`${response.status}`);
  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (!text.trim()) throw new Error('empty response');
  return text;
}

/** Tries each configured provider in order. Never throws; returns the errors when none succeed. */
export async function llmComplete(request: LlmRequest, env: Env = process.env, fetchImpl: FetchLike = fetch): Promise<LlmOutcome> {
  const providers = configuredLlmProviders(env);
  if (!providers.length) return { ok: false, errors: ['No LLM provider key is configured (GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY or XAI_API_KEY).'] };

  let cacheKey = '';
  if (request.cacheTtlSeconds) {
    cacheKey = `llm:${request.cacheNamespace ?? 'global'}:${await hashKey(JSON.stringify(request.messages), String(request.json ?? false))}`;
    const hit = await cacheGet(cacheKey, env, fetchImpl);
    if (hit) {
      try {
        const parsed = JSON.parse(hit) as { provider: LlmProviderId; model: string; text: string };
        return { ok: true, ...parsed, cached: true };
      } catch {
        /* ignore a corrupt cache entry */
      }
    }
  }

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const text = provider.id === 'gemini' ? await callGemini(provider, request, fetchImpl) : await callOpenAiCompatible(provider, request, fetchImpl);
      if (cacheKey && request.cacheTtlSeconds) await cacheSet(cacheKey, JSON.stringify({ provider: provider.id, model: provider.model, text }), request.cacheTtlSeconds, env, fetchImpl);
      return { ok: true, provider: provider.id, model: provider.model, text };
    } catch (error) {
      errors.push(`${provider.id}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }
  return { ok: false, errors };
}

/** Parses a JSON object out of model text, tolerating code fences or surrounding prose. */
export function parseJsonObject<T = Record<string, unknown>>(text: string): T | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
