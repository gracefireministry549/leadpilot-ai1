import { runAgent, type AgentRunInput } from './runtime';
import type { AuthContext } from '../api/lead-finder-handler';
import type { AgentName } from '../../docs/agent-contract';

type AgentResult = Awaited<ReturnType<typeof runAgent>>;
export type OrchestrationRequest = { request: string; mode?: 'lead' | 'work' | 'website' | 'client' | 'general'; approvalRequired?: boolean };
export type OrchestrationResult = { plan: string[]; results: AgentResult[]; finalInstruction: string; needsHumanApproval: boolean };
const MAX_STEPS = 8;

function chooseAgents(input: string, mode?: OrchestrationRequest['mode']): AgentName[] {
  const text = `${mode ?? ''} ${input}`.toLowerCase();
  const agents: AgentName[] = [];
  if (/job|upwork|indeed|freelancer|fiverr|gig|freelance|work/.test(text)) agents.push('workpilot');
  if (/lead|prospect|company|business|customer|market|opportunity/.test(text)) agents.push('opportunity-finder');
  if (/website|web site|landing|site|logo|brand|design/.test(text)) agents.push('website-brand');
  if (/trend|trending|market signal/.test(text)) agents.push('trend-finder');
  if (!agents.length) agents.push('opportunity-finder');
  return [...new Set(agents)].slice(0, 4);
}

export async function orchestrate(request: OrchestrationRequest, auth: AuthContext): Promise<OrchestrationResult> {
  const names = chooseAgents(request.request, request.mode);
  const results: AgentResult[] = [];
  const plan = ['Interpret request', ...names.map((name) => `Run ${name}`), 'Cross-check evidence', 'Human-quality review'];
  for (const agent of names.slice(0, MAX_STEPS)) {
    const input: AgentRunInput = { agent, query: request.request, limit: 20 };
    results.push(await runAgent(auth, input));
  }
  const joined = results.map((result) => JSON.stringify(result.body ?? result)).join('\n');
  const needsHumanApproval = Boolean(request.approvalRequired) || /\b(contract|payment|quote|refund|guarantee|submit|send|publish|deploy)\b/i.test(request.request);
  return {
    plan,
    results,
    finalInstruction: `Produce one concise, evidence-based answer from the specialist results. Never invent missing facts. Mark uncertainty. Do not claim an external action happened unless the tool confirms it. Remove robotic wording and keep the result specific to the user.\n\nSPECIALIST RESULTS:\n${joined}`,
    needsHumanApproval,
  };
}
