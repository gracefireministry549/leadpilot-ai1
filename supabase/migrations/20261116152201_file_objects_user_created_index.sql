-- Support the authenticated user's file listing ordered by newest first.
-- Additive and safe for existing rows; no data is modified.
create index if not exists file_objects_user_created_idx
  on public.file_objects (user_id, created_at desc);
