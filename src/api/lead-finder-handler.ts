import type { LeadProvider, LeadSearchQuery } from '../providers/lead-provider';
import { runLeadFinderPipeline } from '../pipeline/lead-finder-pipeline';
import { persistFinderResults } from '../pipeline/persist-finder-results';
import { configuredLeadStore } from '../leads/store-factory';

export interface AuthContext { accountId: string; }
export interface LeadFinderRequest extends LeadSearchQuery {}

export async function handleLeadFinder(auth: AuthContext | null, request: LeadFinderRequest, providers: LeadProvider[]) {
  if (providers.length === 0) return { status: 503 as const, body: { error: 'No lead-data provider is configured on the server.' } };
  const accountId = auth?.accountId ?? 'public-search';
  const result = await runLeadFinderPipeline(accountId, providers, { industry: request.industry?.trim(), country: request.country?.trim(), city: request.city?.trim(), keywords: request.keywords?.trim(), limit: Math.min(Math.max(request.limit ?? 25, 1), 100) });
  const warnings = [...result.warnings];
  if (auth?.accountId && result.results.length) {
    try { const saved = await persistFinderResults(configuredLeadStore(auth.accountId), auth.accountId, result.results); warnings.push(`Persisted ${saved} lead results to the signed-in workspace.`); }
    catch (error) { warnings.push(`Search completed, but workspace persistence was unavailable: ${error instanceof Error ? error.message : 'storage error'}`); }
  }
  return { status: 200 as const, body: { results: result.results, count: result.results.length, warnings } };
}
