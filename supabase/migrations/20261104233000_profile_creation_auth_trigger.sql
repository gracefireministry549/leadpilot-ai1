create or replace function private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.profiles(id,display_name)
 values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''))
 on conflict(id) do update set display_name=excluded.display_name,updated_at=now();
 return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function private.handle_new_auth_user();
