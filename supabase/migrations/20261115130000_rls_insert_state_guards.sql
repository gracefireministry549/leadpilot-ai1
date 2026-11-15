-- Prevent client inserts from forging approval decisions or verified accounting records.

drop policy if exists "approvals company insert" on public.approval_requests;
create policy "approvals company insert pending only"
  on public.approval_requests for insert to authenticated
  with check (
    private.has_company_role(company_id, array['owner','admin','member'])
    and requested_by = (select auth.uid())
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and executed_at is null
  );

drop policy if exists "finance company insert" on public.financial_entries;
create policy "finance company insert unverified only"
  on public.financial_entries for insert to authenticated
  with check (
    private.has_company_role(company_id, array['owner','admin','member'])
    and created_by = (select auth.uid())
    and status = 'unverified'
  );

drop policy if exists "deletion request own" on public.account_deletion_requests;
create policy "deletion request select own"
  on public.account_deletion_requests for select to authenticated
  using (user_id = (select auth.uid()));
create policy "deletion request insert own"
  on public.account_deletion_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'requested');

revoke update, delete on public.account_deletion_requests from authenticated;
grant select, insert on public.account_deletion_requests to authenticated;

drop policy if exists "activity company insert" on public.activity_events;
create policy "activity company insert as self"
  on public.activity_events for insert to authenticated
  with check (
    private.has_company_role(company_id, array['owner','admin','member'])
    and (actor_id is null or actor_id = (select auth.uid()))
  );

drop policy if exists "leads company insert" on public.leads;
create policy "leads company insert as self"
  on public.leads for insert to authenticated
  with check (
    private.has_company_role(company_id, array['owner','admin','member'])
    and created_by = (select auth.uid())
  );
