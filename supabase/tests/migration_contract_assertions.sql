\set ON_ERROR_STOP on
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');
insert into public.company_memberships(company_id,user_id,role,status) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','member','active'),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','owner','active'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','member','active');

insert into public.approval_requests(id,company_id,action_type,status,payload,decided_by)
values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','outbound_email','approved',
  '{"leadId":"lead-1","to":"lead@example.com","subject":"Approved subject","text":"Approved copy","consentConfirmed":true}',
  '00000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','outbound_email','approved',
  '{"leadId":"lead-2","to":"lead@example.com","subject":"Expired","text":"Copy","consentConfirmed":true}',
  '00000000-0000-4000-8000-000000000002');
update public.approval_requests set expires_at = now() - interval '1 minute'
where id = '20000000-0000-4000-8000-000000000002';

do $$
begin
  if not public.claim_approved_outreach(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','lead-1','lead@example.com','Approved subject','Approved copy'
  ) then raise exception 'first approval claim should succeed'; end if;
  if public.claim_approved_outreach(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','lead-1','lead@example.com','Approved subject','Approved copy'
  ) then raise exception 'concurrent/replayed approval claim should be rejected'; end if;
  if not public.complete_approved_outreach(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',false
  ) then raise exception 'failed send should release the claim'; end if;
  if not public.claim_approved_outreach(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','lead-1','lead@example.com','Approved subject','Approved copy'
  ) then raise exception 'released approval should be retryable'; end if;
  if not public.complete_approved_outreach(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',true
  ) then raise exception 'successful send should finalize approval'; end if;
  if public.claim_approved_outreach(
    '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','lead-1','lead@example.com','Approved subject','Approved copy'
  ) then raise exception 'executed approval must not be reusable'; end if;
  if public.claim_approved_outreach(
    '20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001','lead-2','lead@example.com','Expired','Copy'
  ) then raise exception 'expired approval must not be executable'; end if;
end $$;

select public.process_paystack_success(
  'charge.success:ngn-test','ngn-test','provider-1',
  '00000000-0000-4000-8000-000000000001',null,null,500000,'NGN',now(),'{}'::jsonb
);
select public.process_paystack_success(
  'charge.success:xof-test','xof-test','provider-2',
  '00000000-0000-4000-8000-000000000001',null,null,5000,'XOF',now(),'{}'::jsonb
);
do $$
begin
  if (select amount from public.payment_transactions where reference='ngn-test') <> 500000 then
    raise exception 'payment transaction must retain minor units';
  end if;
  if (select value from public.revenue_events where currency='NGN') <> 5000 then
    raise exception 'NGN revenue must be stored in major units';
  end if;
  if (select value from public.revenue_events where currency='XOF') <> 5000 then
    raise exception 'XOF revenue must not be divided by 100';
  end if;
  if public.process_paystack_success(
    'charge.success:ngn-test','ngn-test','provider-1',
    '00000000-0000-4000-8000-000000000001',null,null,500000,'NGN',now(),'{}'::jsonb
  ) then raise exception 'duplicate payment event must be ignored'; end if;
  if (select count(*) from public.revenue_events) <> 2 then
    raise exception 'duplicate event must not add revenue';
  end if;
  begin
    perform public.process_paystack_success(
      'charge.success:jpy-test','jpy-test','provider-3',
      '00000000-0000-4000-8000-000000000001',null,null,100,'JPY',now(),'{}'::jsonb
    );
    raise exception 'unsupported currency should be rejected';
  exception when raise_exception then
    if sqlerrm = 'unsupported currency should be rejected' then raise; end if;
  end;
end $$;

insert into public.agent_employees(id,company_id) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into public.businesses(id,company_id) values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
set role authenticated;
insert into public.company_tasks(id,company_id,employee_id,created_by) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
do $$
begin
  begin
    insert into public.company_tasks(id,company_id,employee_id,created_by) values
     ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
    raise exception 'cross-company employee assignment should be rejected';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.leads(id,company_id,business_id,created_by) values
     ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
    raise exception 'cross-company business reference should be rejected';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
