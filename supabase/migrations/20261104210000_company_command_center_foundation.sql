-- LeadPilot AI company command-centre foundation.
-- Company-scoped records; access is granted only through active memberships.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  status text not null default 'active' check (status in ('active','invited','suspended')),
  created_at timestamptz not null default now(),
  unique(company_id,user_id)
);
create index company_memberships_user_idx on public.company_memberships(user_id,status);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, website text, phone text, email text, address text, city text, country text, industry text,
  source text not null default 'manual', source_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index businesses_company_name_idx on public.businesses(company_id,lower(name));

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'NEW',
  score integer not null default 0 check(score between 0 and 100),
  score_label text not null default 'LOW',
  reliability_confidence integer check(reliability_confidence between 0 and 100),
  reliability_level text, website_status text, recommendation text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index leads_company_status_idx on public.leads(company_id,status);
create index leads_company_score_idx on public.leads(company_id,score desc);
create index leads_business_id_idx on public.leads(business_id);
create index leads_created_by_idx on public.leads(created_by);

create table public.agent_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role_key text not null check(role_key in ('company_manager','opportunity_researcher','lead_researcher','website_builder','sales_analyst','finance_assistant')),
  display_name text not null, description text not null default '',
  status text not null default 'active' check(status in ('active','paused')),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,role_key)
);
create table public.company_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.agent_employees(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null, instructions text not null default '',
  status text not null default 'queued' check(status in ('queued','running','succeeded','failed','cancelled')),
  result jsonb, error text, created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz
);
create index company_tasks_company_created_idx on public.company_tasks(company_id,created_at desc);
create index company_tasks_employee_id_idx on public.company_tasks(employee_id);
create index company_tasks_created_by_idx on public.company_tasks(created_by);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  action_type text not null, title text not null, summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','approved','rejected','expired','executed')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz, executed_at timestamptz, expires_at timestamptz, idempotency_key text,
  created_at timestamptz not null default now(), unique(company_id,idempotency_key)
);
create index approval_requests_pending_idx on public.approval_requests(company_id,status,created_at desc);
create index approval_requests_requested_by_idx on public.approval_requests(requested_by);
create index approval_requests_decided_by_idx on public.approval_requests(decided_by);

create table public.research_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  agent_key text not null, title text not null, summary text not null default '',
  findings jsonb not null default '[]'::jsonb, evidence jsonb not null default '[]'::jsonb,
  confidence integer check(confidence between 0 and 100), created_at timestamptz not null default now()
);
create index research_reports_company_created_idx on public.research_reports(company_id,created_at desc);
create index research_reports_created_by_idx on public.research_reports(created_by);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  entry_type text not null check(entry_type in ('revenue','expense')),
  status text not null default 'unverified' check(status in ('unverified','verified','void')),
  amount_minor bigint not null check(amount_minor>=0), currency char(3) not null default 'NGN',
  description text not null, evidence_reference text, occurred_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index financial_entries_company_date_idx on public.financial_entries(company_id,occurred_at desc);
create index financial_entries_created_by_idx on public.financial_entries(created_by);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null, summary text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_events_company_created_idx on public.activity_events(company_id,created_at desc);
create index activity_events_actor_id_idx on public.activity_events(actor_id);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested' check(status in ('requested','cancelled','completed')),
  requested_at timestamptz not null default now(), completed_at timestamptz,
  unique(user_id,status)
);
create table public.auth_rate_limits (
  id uuid primary key default gen_random_uuid(), action text not null, subject_hash text not null,
  window_started_at timestamptz not null, attempts integer not null default 1,
  unique(action,subject_hash,window_started_at)
);
comment on table public.auth_rate_limits is 'Server-only rate limit counters; no client policies or grants.';

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_memberships enable row level security;
alter table public.businesses enable row level security;
alter table public.leads enable row level security;
alter table public.agent_employees enable row level security;
alter table public.company_tasks enable row level security;
alter table public.approval_requests enable row level security;
alter table public.research_reports enable row level security;
alter table public.financial_entries enable row level security;
alter table public.activity_events enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.auth_rate_limits enable row level security;

create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
create or replace function private.is_company_member(target_company uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select (select auth.uid()) is not null and exists (
  select 1 from public.company_memberships m where m.company_id=target_company
  and m.user_id=(select auth.uid()) and m.status='active'
 );
$$;
revoke all on function private.is_company_member(uuid) from public,anon;
grant execute on function private.is_company_member(uuid) to authenticated;

create policy "profiles select own" on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy "profiles insert own" on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy "profiles update own" on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy "companies select membership" on public.companies for select to authenticated using(created_by=(select auth.uid()) or private.is_company_member(id));
create policy "companies create own" on public.companies for insert to authenticated with check(created_by=(select auth.uid()));
create policy "companies update admins" on public.companies for update to authenticated using(exists(select 1 from public.company_memberships m where m.company_id=id and m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin'))) with check(private.is_company_member(id));
create policy "memberships select own company" on public.company_memberships for select to authenticated using(user_id=(select auth.uid()) or private.is_company_member(company_id));
create policy "creator creates owner membership" on public.company_memberships for insert to authenticated with check(user_id=(select auth.uid()) and role='owner' and exists(select 1 from public.companies c where c.id=company_id and c.created_by=(select auth.uid())));

create policy "businesses company member access" on public.businesses for all to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy "leads company member access" on public.leads for all to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy "employees company member access" on public.agent_employees for all to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy "tasks company member access" on public.company_tasks for all to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy "approvals company member access" on public.approval_requests for all to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy "reports company member access" on public.research_reports for all to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy "finance company member access" on public.financial_entries for all to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy "activity company member access" on public.activity_events for all to authenticated using(private.is_company_member(company_id)) with check(private.is_company_member(company_id));
create policy "deletion request own" on public.account_deletion_requests for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

grant select,insert,update on public.profiles to authenticated;
grant select,insert,update on public.companies to authenticated;
grant select,insert on public.company_memberships to authenticated;
grant select,insert,update,delete on public.businesses,public.leads,public.agent_employees,public.company_tasks,public.approval_requests,public.research_reports,public.financial_entries,public.activity_events to authenticated;
grant select,insert,update on public.account_deletion_requests to authenticated;
revoke all on public.auth_rate_limits from anon,authenticated;
