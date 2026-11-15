-- Process Paystack success events atomically so retries cannot double-count revenue.
-- The processed-event table remains private; the service-role API calls this RPC only.
create or replace function public.process_paystack_success(
  target_event_id text,
  target_reference text,
  target_provider_transaction_id text,
  target_user_id uuid,
  target_lead_id text,
  target_agent_id text,
  target_amount_minor bigint,
  target_currency text,
  target_paid_at timestamptz,
  target_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_event_id uuid;
begin
  insert into private.processed_payment_events(provider, event_id, reference)
  values ('paystack', target_event_id, target_reference)
  on conflict (event_id) do nothing
  returning id into claimed_event_id;

  if claimed_event_id is null then
    return false;
  end if;

  insert into public.payment_transactions(
    user_id, reference, provider_transaction_id, status, amount, currency,
    lead_id, agent_id, paid_at, raw_event
  ) values (
    target_user_id, target_reference, target_provider_transaction_id, 'success',
    target_amount_minor, target_currency, target_lead_id, target_agent_id,
    target_paid_at, target_payload
  )
  on conflict (reference) do update set
    provider_transaction_id = excluded.provider_transaction_id,
    status = 'success',
    amount = excluded.amount,
    currency = excluded.currency,
    lead_id = excluded.lead_id,
    agent_id = excluded.agent_id,
    paid_at = excluded.paid_at,
    raw_event = excluded.raw_event,
    updated_at = now();

  insert into public.revenue_events(
    user_id, lead_id, agent_id, event, value, currency, occurred_at
  ) values (
    target_user_id, target_lead_id, target_agent_id, 'won',
    target_amount_minor::numeric / 100, target_currency, target_paid_at
  );

  return true;
end;
$$;

revoke all on function public.process_paystack_success(text,text,text,uuid,text,text,bigint,text,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.process_paystack_success(text,text,text,uuid,text,text,bigint,text,timestamptz,jsonb)
  to service_role;
