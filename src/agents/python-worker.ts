import type { AgentRunInput } from './runtime';

/** Optional Python reasoning bridge. TypeScript remains the control plane. */
export type PythonAgentResponse = { results: Array<{ matchScore?: number; [key: string]: unknown }>; [key: string]: unknown };

export const PYTHON_REASONING_AGENTS = new Set<AgentRunInput['agent']>([
  'lead-finder', 'trend-finder', 'opportunity-finder', 'tender-finder', 'ecommerce-opportunity',
  'workpilot', 'content', 'competitor-monitor', 'outreach', 'website-brand', 'gbp-audit',
  'gbp-outreach', 'gbp-fix',
]);

export async function runPythonAgent(
  input: AgentRunInput,
  extra: Record<string, unknown> = {},
): Promise<PythonAgentResponse | null> {
  const base = process.env.PYTHON_AGENT_URL?.replace(/\/$/, '');
  const secret = process.env.PYTHON_AGENT_SECRET;
  // Fail closed: never send company data to an unauthenticated worker.
  if (!base || !secret) return null;

  const timeoutMs = Number(process.env.PYTHON_AGENT_TIMEOUT_MS || 15_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1_000, Math.min(timeoutMs, 30_000)));

  try {
    const response = await fetch(`${base}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LeadPilot-Worker-Secret': secret,
      },
      body: JSON.stringify({ ...input, ...extra }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json() as Record<string, unknown>;
    if (body.error || !Array.isArray(body.results)) return null;
    return body as PythonAgentResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
