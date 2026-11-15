create extension if not exists pgcrypto;
create schema if not exists auth;
create schema if not exists private;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create table auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.company_memberships (
  company_id uuid not null,
  user_id uuid not null references auth.users(id),
  role text not null,
  status text not null
);

create or replace function private.has_company_role(target_company uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;

create table public.approval_requests (
  id uuid primary key,
  company_id uuid not null,
  action_type text not null,
  status text not null,
  executed_at timestamptz,
  expires_at timestamptz,
  payload jsonb not null,
  decided_by uuid references auth.users(id)
);

create table private.processed_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null unique,
  reference text,
  received_at timestamptz not null default now()
);
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  reference text not null unique,
  provider_transaction_id text,
  status text not null,
  amount bigint not null,
  currency text not null,
  lead_id text,
  agent_id text,
  paid_at timestamptz,
  raw_event jsonb,
  updated_at timestamptz not null default now()
);
create table public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lead_id text,
  agent_id text,
  event text not null,
  value numeric not null,
  currency text not null,
  occurred_at timestamptz not null
);

create table public.agent_employees (id uuid primary key, company_id uuid not null);
create table public.company_tasks (id uuid primary key, company_id uuid not null, employee_id uuid, created_by uuid not null);
create table public.businesses (id uuid primary key, company_id uuid not null);
create table public.leads (id uuid primary key, company_id uuid not null, business_id uuid not null, created_by uuid not null);

alter table public.company_tasks enable row level security;
alter table public.leads enable row level security;
alter table public.businesses enable row level security;
create policy "test businesses read" on public.businesses for select to authenticated
  using (private.has_company_role(company_id, array['owner','admin','member','viewer']));

grant usage on schema auth, private to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public.company_memberships, public.agent_employees, public.businesses to authenticated;
grant insert on public.company_tasks, public.leads to authenticated;
