-- Reduce overlapping employee policies and move private rate-limit counters out of exposed public schema.
drop policy if exists "employees company manage" on public.agent_employees;
create policy "employees company insert" on public.agent_employees for insert to authenticated with check(private.has_company_role(company_id,array['owner','admin']));
create policy "employees company update" on public.agent_employees for update to authenticated using(private.has_company_role(company_id,array['owner','admin'])) with check(private.has_company_role(company_id,array['owner','admin']));
create policy "employees company delete" on public.agent_employees for delete to authenticated using(private.has_company_role(company_id,array['owner','admin']));
alter table public.auth_rate_limits set schema private;
revoke all on private.auth_rate_limits from public,anon,authenticated;
drop policy if exists "tasks company update" on public.company_tasks;
create policy "tasks company update" on public.company_tasks for update to authenticated
using(private.has_company_role(company_id,array['owner','admin']) or (private.has_company_role(company_id,array['member']) and created_by=(select auth.uid())))
with check(private.has_company_role(company_id,array['owner','admin']) or (private.has_company_role(company_id,array['member']) and created_by=(select auth.uid())));
