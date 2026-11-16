\set ON_ERROR_STOP on
do $$
declare
  required_table text;
  tables text[] := array[
    'profiles','companies','company_memberships','businesses','leads',
    'agent_employees','company_tasks','approval_requests','research_reports',
    'financial_entries','activity_events','account_deletion_requests',
    'lead_imports','verification_checks','score_factors','activities',
    'status_history','agent_memory','agent_events','agent_schedules',
    'revenue_events','payment_transactions','agent_sessions','agent_memories',
    'file_objects'
  ];
begin
  foreach required_table in array tables loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'missing expected public table: %', required_table;
    end if;
    if not (select relrowsecurity from pg_class where oid=to_regclass('public.' || required_table)) then
      raise exception 'RLS is not enabled on public.%', required_table;
    end if;
  end loop;
  if not exists(select 1 from storage.buckets where id='leadpilot-files' and public=false and file_size_limit=10485760) then
    raise exception 'private file bucket is missing or misconfigured';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and tablename='file_objects' and indexname='file_objects_user_created_idx') then
    raise exception 'file listing index is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='on_auth_user_created_profile' and not tgisinternal) then
    raise exception 'auth profile trigger is missing';
  end if;
  if has_function_privilege('anon','public.process_paystack_success(text,text,text,uuid,text,text,bigint,text,timestamp with time zone,jsonb)','EXECUTE') then
    raise exception 'anon must not execute payment processor';
  end if;
  if has_function_privilege('authenticated','public.claim_approved_outreach(uuid,uuid,uuid,text,text,text,text)','EXECUTE') then
    raise exception 'authenticated must not execute privileged outreach claim';
  end if;
  if not has_function_privilege('service_role','public.claim_approved_outreach(uuid,uuid,uuid,text,text,text,text)','EXECUTE') then
    raise exception 'service_role must execute outreach claim';
  end if;
end $$;

insert into auth.users(id,raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000001','{"display_name":"Migration Test"}');
do $$
begin
  if not exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000001' and display_name='Migration Test') then
    raise exception 'auth user profile trigger did not create the profile';
  end if;
end $$;
