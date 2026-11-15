-- Make approved outreach execution atomic, retryable and provider-idempotent.
alter table public.approval_requests
  add column if not exists execution_claimed_at timestamptz,
  add column if not exists execution_claimed_by uuid references auth.users(id) on delete set null;

create or replace function public.claim_approved_outreach(
  target_approval_id uuid,
  target_company_id uuid,
  target_actor_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.approval_requests a
  set execution_claimed_at = now(),
      execution_claimed_by = target_actor_id
  where a.id = target_approval_id
    and a.company_id = target_company_id
    and a.action_type = 'outbound_email'
    and a.status = 'approved'
    and a.executed_at is null
    and (
      a.execution_claimed_at is null
      or a.execution_claimed_at < now() - interval '23 hours'
    )
    and exists (
      select 1 from public.company_memberships actor_membership
      where actor_membership.company_id = a.company_id
        and actor_membership.user_id = target_actor_id
        and actor_membership.status = 'active'
    )
    and exists (
      select 1 from public.company_memberships approver_membership
      where approver_membership.company_id = a.company_id
        and approver_membership.user_id = a.decided_by
        and approver_membership.status = 'active'
        and approver_membership.role in ('owner', 'admin')
    );

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.complete_approved_outreach(
  target_approval_id uuid,
  target_company_id uuid,
  target_actor_id uuid,
  target_succeeded boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.approval_requests a
  set status = case when target_succeeded then 'executed' else 'approved' end,
      executed_at = case when target_succeeded then now() else null end,
      execution_claimed_at = null,
      execution_claimed_by = null
  where a.id = target_approval_id
    and a.company_id = target_company_id
    and a.action_type = 'outbound_email'
    and a.status = 'approved'
    and a.executed_at is null
    and a.execution_claimed_by = target_actor_id;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_approved_outreach(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.complete_approved_outreach(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.claim_approved_outreach(uuid,uuid,uuid) to service_role;
grant execute on function public.complete_approved_outreach(uuid,uuid,uuid,boolean) to service_role;
