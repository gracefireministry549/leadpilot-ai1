-- Enforce company roles at the database boundary, not only in UI/server actions.
create or replace function private.has_company_role(target_company uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null and exists(
  select 1 from public.company_memberships m where m.company_id=target_company
  and m.user_id=(select auth.uid()) and m.status='active' and m.role=any(allowed_roles)
 );
$$;
revoke all on function private.has_company_role(uuid,text[]) from public,anon;
grant execute on function private.has_company_role(uuid,text[]) to authenticated;

drop policy if exists "businesses company member access" on public.businesses;
create policy "businesses company read" on public.businesses for select to authenticated using(private.is_company_member(company_id));
create policy "businesses company insert" on public.businesses for insert to authenticated with check(private.has_company_role(company_id,array['owner','admin','member']));
create policy "businesses company update" on public.businesses for update to authenticated using(private.has_company_role(company_id,array['owner','admin','member'])) with check(private.has_company_role(company_id,array['owner','admin','member']));
create policy "businesses company delete" on public.businesses for delete to authenticated using(private.has_company_role(company_id,array['owner','admin','member']));

drop policy if exists "leads company member access" on public.leads;
create policy "leads company read" on public.leads for select to authenticated using(private.is_company_member(company_id));
create policy "leads company insert" on public.leads for insert to authenticated with check(private.has_company_role(company_id,array['owner','admin','member']));
create policy "leads company update" on public.leads for update to authenticated using(private.has_company_role(company_id,array['owner','admin','member'])) with check(private.has_company_role(company_id,array['owner','admin','member']));
create policy "leads company delete" on public.leads for delete to authenticated using(private.has_company_role(company_id,array['owner','admin','member']));

drop policy if exists "employees company member access" on public.agent_employees;
create policy "employees company read" on public.agent_employees for select to authenticated using(private.is_company_member(company_id));
create policy "employees company manage" on public.agent_employees for all to authenticated using(private.has_company_role(company_id,array['owner','admin'])) with check(private.has_company_role(company_id,array['owner','admin']));

drop policy if exists "tasks company member access" on public.company_tasks;
create policy "tasks company read" on public.company_tasks for select to authenticated using(private.is_company_member(company_id));
create policy "tasks company insert" on public.company_tasks for insert to authenticated with check(private.has_company_role(company_id,array['owner','admin','member']) and created_by=(select auth.uid()));
create policy "tasks company update" on public.company_tasks for update to authenticated using(private.has_company_role(company_id,array['owner','admin']) or (private.has_company_role(company_id,array['member']) and created_by=(select auth.uid()))) with check(private.is_company_member(company_id));
create policy "tasks company delete" on public.company_tasks for delete to authenticated using(private.has_company_role(company_id,array['owner','admin']));

drop policy if exists "approvals company member access" on public.approval_requests;
create policy "approvals company read" on public.approval_requests for select to authenticated using(private.is_company_member(company_id));
create policy "approvals company insert" on public.approval_requests for insert to authenticated with check(private.has_company_role(company_id,array['owner','admin','member']) and requested_by=(select auth.uid()));
create policy "approvals company decide" on public.approval_requests for update to authenticated using(private.has_company_role(company_id,array['owner','admin'])) with check(private.has_company_role(company_id,array['owner','admin']));

drop policy if exists "reports company member access" on public.research_reports;
create policy "reports company read" on public.research_reports for select to authenticated using(private.is_company_member(company_id));
create policy "reports company insert" on public.research_reports for insert to authenticated with check(private.has_company_role(company_id,array['owner','admin','member']) and created_by=(select auth.uid()));

drop policy if exists "finance company member access" on public.financial_entries;
create policy "finance company read" on public.financial_entries for select to authenticated using(private.is_company_member(company_id));
create policy "finance company insert" on public.financial_entries for insert to authenticated with check(private.has_company_role(company_id,array['owner','admin','member']) and created_by=(select auth.uid()));
create policy "finance company verify" on public.financial_entries for update to authenticated using(private.has_company_role(company_id,array['owner','admin'])) with check(private.has_company_role(company_id,array['owner','admin']));

drop policy if exists "activity company member access" on public.activity_events;
create policy "activity company read" on public.activity_events for select to authenticated using(private.is_company_member(company_id));
create policy "activity company insert" on public.activity_events for insert to authenticated with check(private.has_company_role(company_id,array['owner','admin','member']));
