import type { LeadProvider, LeadSearchQuery } from '../providers/lead-provider';
import { runLeadFinderPipeline } from '../pipeline/lead-finder-pipeline';
import { persistFinderResults } from '../pipeline/persist-finder-results';
import { configuredLeadStore } from '../leads/store-factory';

export interface AuthContext { accountId: string; userId?: string; }
export interface LeadFinderRequest extends LeadSearchQuery {}

export async function handleLeadFinder(auth: AuthContext | null, request: LeadFinderRequest, providers: LeadProvider[]) {
  if (providers.length === 0) return { status: 503 as const, body: { error: 'No lead-data provider is configured on the server.' } };
  const accountId = auth?.accountId ?? 'public-search';
  const result = await runLeadFinderPipeline(accountId, providers, { industry: request.industry?.trim(), country: request.country?.trim(), city: request.city?.trim(), keywords: request.keywords?.trim(), limit: Math.min(Math.max(request.limit ?? 25, 1), 100) });
  const warnings = [...result.warnings];
  if (auth?.accountId && result.results.length) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !serviceRoleKey) {
      // Be honest instead of silently writing to a throwaway in-memory store
      // that no workspace page can ever read.
      warnings.push('Results were found but NOT saved: workspace persistence is not configured on this server (SUPABASE_SERVICE_ROLE_KEY missing). Contact your administrator to enable saving leads.');
    } else {
      try { const saved = await persistFinderResults(configuredLeadStore(auth.accountId, auth.userId), auth.accountId, result.results); warnings.push(`Persisted ${saved} lead results to the signed-in workspace.`); }
      catch (error) { warnings.push(`Search completed, but workspace persistence was unavailable: ${error instanceof Error ? error.message : 'storage error'}`); }
    }
  }
  return { status: 200 as const, body: { results: result.results, count: result.results.length, warnings } };
}
