-- Per-user profile avatar.
--
-- Two parts:
--   1. waitlist.avatar_url column — public URL of the user's avatar, or
--      null if they haven't uploaded one (UI falls back to the colored
--      initial circle).
--   2. "avatars" Supabase Storage bucket — public-read so the URL works
--      anywhere; writes restricted to objects under <auth.users.id>/...
--      so users can only manage their own avatars.
--
-- Idempotent — safe to re-run.

-- ── 1. avatar_url column on waitlist ─────────────────────────────────
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'waitlist')
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'waitlist' and column_name = 'avatar_url'
     ) then
    execute 'alter table public.waitlist add column avatar_url text';
  end if;
end $$;

comment on column public.waitlist.avatar_url is
  'Public URL of the user''s uploaded avatar. Null = render initial circle. '
  'Stored in the "avatars" Supabase Storage bucket under <auth.users.id>/...';

-- ── 2. avatars storage bucket ─────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2 * 1024 * 1024,                                        -- 2MB hard cap
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read: public — already covered by `public = true` on the bucket, no
-- per-object policy needed.
-- Write/Update/Delete: only allowed when the path's first folder
-- matches the caller's auth.uid(). E.g. user 0123… can write
-- "0123…/avatar.png" but not "ffff…/anything".

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_user_insert_own'
  ) then
    create policy avatars_user_insert_own on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_user_update_own'
  ) then
    create policy avatars_user_update_own on storage.objects
      for update to authenticated
      using (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'avatars_user_delete_own'
  ) then
    create policy avatars_user_delete_own on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'avatars'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;
