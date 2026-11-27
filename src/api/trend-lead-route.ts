import type { LeadProvider, LeadSearchQuery } from '../providers/lead-provider';
import { findLeadsFromTrends } from '../trends/trend-intelligence';
import { persistFinderResults } from '../pipeline/persist-finder-results';
import { configuredLeadStore } from '../leads/store-factory';
import type { AuthContext } from './lead-finder-handler';

export interface TrendLeadHttpRequest {
  method: string;
  body?: unknown;
}

/** POST-only adapter for the trend-first lead discovery flow.
 * Trend discovery can be used as public discovery; authenticated users still
 * receive their normal account-scoped results through the downstream layer.
 */
export async function postTrendLeadsSearch(
  request: TrendLeadHttpRequest,
  auth: AuthContext | null,
  providers: LeadProvider[],
) {
  if (request.method.toUpperCase() !== 'POST') return { status: 405, body: { error: 'Method not allowed' } };

  const body = typeof request.body === 'object' && request.body !== null
    ? request.body as Record<string, unknown>
    : {};
  const query: LeadSearchQuery = {
    industry: typeof body.industry === 'string' ? body.industry : undefined,
    country: typeof body.country === 'string' ? body.country : undefined,
    city: typeof body.city === 'string' ? body.city : (typeof body.location === 'string' ? body.location : undefined),
    keywords: typeof body.query === 'string' ? body.query : (typeof body.keywords === 'string' ? body.keywords : undefined),
    limit: typeof body.limit === 'number' ? body.limit : undefined,
  };

  try {
    // Use a stable public account namespace for anonymous discovery. When a
    // user is signed in, preserve the user's account id for downstream
    // persistence/scoring behavior.
    const accountId = auth?.accountId ?? 'public-search';
    const result = await findLeadsFromTrends(accountId, query, providers);
    const warnings = [...result.warnings];
    // Signed-in trend searches must persist like the normal lead search, or
    // the results silently vanish instead of reaching the CRM.
    if (auth?.accountId && result.results.length) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (!url || !serviceRoleKey) {
        warnings.push('Results were found but NOT saved: workspace persistence is not configured on this server (SUPABASE_SERVICE_ROLE_KEY missing).');
      } else {
        try {
          const saved = await persistFinderResults(configuredLeadStore(auth.accountId, auth.userId), auth.accountId, result.results);
          warnings.push(`Persisted ${saved} lead results to the signed-in workspace.`);
        } catch (error) {
          warnings.push(`Search completed, but workspace persistence was unavailable: ${error instanceof Error ? error.message : 'storage error'}`);
        }
      }
    }
    return { status: 200, body: { ...result, warnings } };
  } catch (error) {
    return {
      status: 502,
      body: { error: error instanceof Error ? error.message : 'Trend lead discovery failed' },
    };
  }
}
