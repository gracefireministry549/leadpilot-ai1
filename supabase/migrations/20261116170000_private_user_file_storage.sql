-- Private, user-owned file storage for LeadPilot.
-- Storage is private by default; object keys are scoped to the authenticated user's UUID.
create table if not exists public.file_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 's3_compatible')),
  bucket_id text not null,
  object_key text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  unique (storage_provider, bucket_id, object_key)
);

alter table public.file_objects enable row level security;
revoke all on public.file_objects from anon;
grant usage on schema public to authenticated;
grant select, insert, delete on public.file_objects to authenticated;

create policy "users read own file metadata"
  on public.file_objects for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users insert own file metadata"
  on public.file_objects for insert to authenticated
  with check (user_id = (select auth.uid()) and storage_provider = 'supabase' and bucket_id = 'leadpilot-files');

create policy "users delete own file metadata"
  on public.file_objects for delete to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leadpilot-files',
  'leadpilot-files',
  false,
  10485760,
  array[
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "users upload own LeadPilot files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'leadpilot-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users read own LeadPilot files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'leadpilot-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete own LeadPilot files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'leadpilot-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
