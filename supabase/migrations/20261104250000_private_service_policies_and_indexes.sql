create policy "service role only auth rate limits" on private.auth_rate_limits for all to service_role using(true) with check(true);
create policy "service role only payment event dedupe" on private.processed_payment_events for all to service_role using(true) with check(true);
create policy "service role only agent memory" on public.agent_memory for all to service_role using(true) with check(true);
create policy "service role only agent events" on public.agent_events for all to service_role using(true) with check(true);
create index if not exists activities_company_id_idx on public.activities(company_id);
create index if not exists activities_lead_id_idx on public.activities(lead_id);
create index if not exists lead_imports_company_id_idx on public.lead_imports(company_id);
create index if not exists status_history_company_id_idx on public.status_history(company_id);
create index if not exists status_history_lead_id_idx on public.status_history(lead_id);
