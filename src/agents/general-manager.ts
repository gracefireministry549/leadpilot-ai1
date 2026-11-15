import type { AgentRunInput } from './runtime';
import { handleLeadFinder } from '../api/lead-finder-handler';
import { configuredLeadProviders } from '../providers/configured-provider';
import { runPythonAgent } from './python-worker';
import { interpretLeadQuery } from './lead-query';

type GeneralManagerResult = { status: number; body: any };
const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL?.replace(/\/$/, '');
const PYTHON_AGENT_SECRET = process.env.PYTHON_AGENT_SECRET;
const ROUTES: Record<string, string> = { lead: 'lead-finder', leads: 'lead-finder', leadfinder: 'lead-finder', trend: 'trend-finder', trends: 'trend-finder', opportunity: 'opportunity-finder', opportunities: 'opportunity-finder', tender: 'tender-finder', tenders: 'tender-finder', ecommerce: 'ecommerce-opportunity', shop: 'ecommerce-opportunity', work: 'workpilot', content: 'content', website: 'website-brand', brand: 'website-brand', competitor: 'competitor-monitor', outreach: 'outreach', 'gbp-audit': 'gbp-audit', 'gbp-outreach': 'gbp-outreach', 'gbp-fix': 'gbp-fix' };

function chooseAgents(query: string): string[] {
  const q = query.toLowerCase(), out = new Set<string>();
  if (/competitor|competition|rival/.test(q)) out.add(ROUTES.competitor);
  if (/trend|trending|hot|growing/.test(q)) out.add(ROUTES.trend);
  if (/tender|procurement|bid|contract/.test(q)) out.add(ROUTES.tender);
  if (/e-?commerce|product|sell online/.test(q)) out.add(ROUTES.ecommerce);
  if (/website|brand|landing page|rebrand/.test(q)) out.add(ROUTES.website);
  if (/content|post|copy|blog|caption/.test(q)) out.add(ROUTES.content);
  if (/outreach|email|message prospects|contact prospects/.test(q)) out.add(ROUTES.outreach);
  if (/google business|gbp|google profile|maps profile/.test(q)) out.add(ROUTES['gbp-audit']);
  if (/workpilot|freelance|job|work opportunity/.test(q)) out.add(ROUTES.work);
  if (/opportunit|market research|business idea/.test(q)) out.add(ROUTES.opportunity);
  if (/lead|business|company|restaurant|customer|prospect|find .* in /.test(q)) out.add(ROUTES.lead);
  return [...out].slice(0, 3);
}

function localSynthesis(query: string, agents: string[], findings: any[]) {
  const leadFinding = findings.find((item) => item.agent === 'lead-finder');
  const results = Array.isArray(leadFinding?.results) ? leadFinding.results : [];
  const warnings = findings.flatMap((item) => Array.isArray(item.warnings) ? item.warnings : []);
  const steps = agents.map((agent) => ({ agent, status: 'complete', label: agent === 'lead-finder' ? `Searched and verified ${results.length} source-backed businesses` : `Ran ${agent}` }));
  const message = results.length
    ? `I found ${results.length} real, source-backed business lead${results.length === 1 ? '' : 's'}. I searched live providers, removed duplicates, and ranked the matches by available public evidence.`
    : 'I could not verify a matching business from the live sources yet. I did not invent leads; try a city plus a business type and I will search again.';
  return { results, warnings, steps, message, agentic: { orchestrated: agents, fallback: 'local-control-plane' }, query };
}

async function synthesize(input: AgentRunInput, agents: string[], findings: unknown[]): Promise<GeneralManagerResult> {
  // The optional Python worker is trusted only when the shared service secret is configured.
  if (!PYTHON_AGENT_URL || !PYTHON_AGENT_SECRET) return { status: 200, body: localSynthesis(input.query, agents, findings) };
  try {
    const response = await fetch(`${PYTHON_AGENT_URL}/v1/agents/general-manager`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-LeadPilot-Worker-Secret': PYTHON_AGENT_SECRET },
      body: JSON.stringify({ query: input.query, location: input.location, city: input.city, country: input.country, industry: input.industry, limit: input.limit ?? 25, agents, findings }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { status: response.status, body: data };
  } catch { /* The deterministic control-plane summary remains available. */ }
  return { status: 200, body: localSynthesis(input.query, agents, findings) };
}

/** Coordinates specialists, while retaining a working no-Python fallback for live lead discovery. */
export async function runGeneralManager(account: any, input: AgentRunInput): Promise<GeneralManagerResult> {
  const agents = chooseAgents(input.query);
  const selected = agents.length ? agents : ['lead-finder'];
  const findings: unknown[] = [];
  for (const agent of selected) {
    if (agent === 'lead-finder') {
      const query = interpretLeadQuery({ keywords: input.query, industry: input.industry, country: input.country, city: input.city || input.location, limit: input.limit ?? 25 });
      const result = await handleLeadFinder(account, query, configuredLeadProviders());
      const body = result.body as Record<string, unknown>;
      findings.push({ agent, results: Array.isArray(body.results) ? body.results : [], warnings: Array.isArray(body.warnings) ? body.warnings : [] });
    } else {
      const result = await runPythonAgent({ ...input, agent: agent as AgentRunInput['agent'] });
      findings.push({ agent, results: result?.results ?? [], warnings: result ? [] : [`${agent} reasoning service is unavailable; continuing with available agents.`] });
    }
  }
  return synthesize(input, selected, findings);
}
