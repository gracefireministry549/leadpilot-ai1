import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolves a user's active company. A requested company is never trusted
 * without a matching active membership. When omitted, use the same stable
 * oldest-membership default as the workspace server actions.
 */
export async function getActiveCompanyMembership(
  supabase: SupabaseClient,
  userId: string,
  requestedCompanyId?: string,
) {
  let query = supabase
    .from('company_memberships')
    .select('company_id,role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (requestedCompanyId) query = query.eq('company_id', requestedCompanyId);
  return query.limit(1).maybeSingle();
}
