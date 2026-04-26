-- Realign student_verification RLS to the live schema (audit MED #5).
--
-- Migration 010 created the table with a `waitlist_user_id` column and an
-- RLS policy keyed off it. Migration 019 + the application code (e.g.
-- /api/student/submit, getApprovedStudent) treat the table as having
-- `user_id` referencing auth.users.id. The deployed schema appears to use
-- `user_id` directly. The 010 RLS policy is therefore stale at best,
-- non-functional at worst, and the table's authz comes entirely from app
-- code rather than the DB.
--
-- This migration drops the old policy and creates one keyed on
-- auth.uid() = user_id. Idempotent + safe whether the column is named
-- `user_id` only (the live case) or both columns coexist.

do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public' and tablename = 'student_verification'
  ) then
    -- Drop the stale waitlist_user_id-based policy.
    execute 'drop policy if exists student_verification_self_read on public.student_verification';

    -- New policy: auth.uid() match against the user_id column. Only
    -- creates the policy if the user_id column actually exists (so
    -- applying against a stale schema with only waitlist_user_id is a
    -- no-op rather than an error).
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'student_verification'
        and column_name = 'user_id'
    ) then
      execute $p$
        create policy student_verification_self_read on public.student_verification
          for select to authenticated
          using (user_id = auth.uid())
      $p$;
    end if;
  end if;
end $$;
