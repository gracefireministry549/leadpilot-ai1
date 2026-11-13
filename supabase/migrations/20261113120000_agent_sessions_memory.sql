-- Agent sessions and long-term memory, scoped to a company and protected by RLS.
-- Additive only: creates two new tables and does not change existing ones.

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_role text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid references public.agent_sessions(id) on delete set null,
  employee_role text not null,
  kind text not null check (kind in ('finding', 'preference', 'note', 'outcome')),
  content text not null check (char_length(content) between 3 and 600),
  source_url text,
  importance smallint not null default 3 check (importance between 1 and 5),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  -- Anti-fabrication rule enforced in the database: a claim about the world needs a source.
  constraint finding_requires_source check (kind <> 'finding' or (source_url is not null and source_url ~* '^https?://'))
);

create index if not exists agent_sessions_lookup on public.agent_sessions (company_id, user_id, employee_role, last_active_at desc);
create index if not exists agent_memories_recall on public.agent_memories (company_id, employee_role, importance desc, created_at desc);

alter table public.agent_sessions enable row level security;
alter table public.agent_memories enable row level security;

create policy "agent sessions company member access" on public.agent_sessions
  for all to authenticated
  using (private.is_company_member(company_id) and user_id = (select auth.uid()))
  with check (private.is_company_member(company_id) and user_id = (select auth.uid()));

create policy "agent memories company member access" on public.agent_memories
  for all to authenticated
  using (private.is_company_member(company_id))
  with check (private.is_company_member(company_id));
