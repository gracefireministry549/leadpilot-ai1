-- Enforce same-company foreign-key relationships at the database boundary.
drop policy if exists "tasks company insert" on public.company_tasks;
create policy "tasks company insert"
  on public.company_tasks for insert to authenticated
  with check (
    private.has_company_role(company_id, array['owner','admin','member'])
    and created_by = (select auth.uid())
    and (
      employee_id is null
      or exists (
        select 1 from public.agent_employees e
        where e.id = company_tasks.employee_id
          and e.company_id = company_tasks.company_id
      )
    )
  );

drop policy if exists "leads company insert as self" on public.leads;
create policy "leads company insert as self"
  on public.leads for insert to authenticated
  with check (
    private.has_company_role(company_id, array['owner','admin','member'])
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.businesses b
      where b.id = leads.business_id
        and b.company_id = leads.company_id
    )
  );
