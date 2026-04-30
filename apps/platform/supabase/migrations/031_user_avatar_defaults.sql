-- Random-default avatars for every user.
--
-- Two new columns on waitlist:
--   - avatar_emoji  text  — one emoji from a curated pool of 40
--   - avatar_color  text  — one of 12 gradient color keys
--
-- Picked at signup time by lib/avatar-defaults.ts → pickAvatarDefaults();
-- existing rows are backfilled here using a deterministic-from-id hash so
-- everyone gets a stable random-looking pair without needing the app to
-- run a one-shot script. The arrays below MUST stay in lockstep with
-- AVATAR_EMOJI_POOL / AVATAR_COLOR_KEYS in lib/avatar-defaults.ts —
-- otherwise the backfill picks from a stale set.
--
-- Idempotent.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'waitlist')
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'waitlist' and column_name = 'avatar_emoji'
     ) then
    execute 'alter table public.waitlist add column avatar_emoji text';
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'waitlist')
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'waitlist' and column_name = 'avatar_color'
     ) then
    execute 'alter table public.waitlist add column avatar_color text';
  end if;
end $$;

comment on column public.waitlist.avatar_emoji is
  'Random emoji assigned at signup. Renders as the user''s avatar when '
  'avatar_url is null.';
comment on column public.waitlist.avatar_color is
  'Color key from AVATAR_COLOR_KEYS in lib/avatar-defaults.ts. Maps to a '
  'Tailwind gradient when rendering the avatar fallback.';

-- Backfill: deterministic-from-id picks via hashtext(id::text). abs() so
-- we don't get negative indices; +1 because Postgres arrays are 1-indexed.
update public.waitlist
set avatar_emoji = (
  array[
    '🎯', '🚀', '⚡', '🔥', '💎', '🎲', '🦊', '🐺', '🦁', '🐯',
    '🦄', '🌈', '🎮', '🏆', '⭐', '🌟', '🎸', '🎨', '🍕', '🌮',
    '☕', '🪐', '🎪', '🎭', '🎬', '📚', '✈️', '🏔️', '🌊', '🦅',
    '🐉', '🌸', '🌻', '🍀', '🥷', '🐝', '👾', '🎷', '🥁', '🛹'
  ]
)[(abs(hashtext(id::text)) % 40) + 1]
where avatar_emoji is null;

update public.waitlist
set avatar_color = (
  array[
    'emerald', 'teal', 'sky', 'blue', 'indigo', 'violet',
    'fuchsia', 'rose', 'orange', 'amber', 'lime', 'cyan'
  ]
)[(abs(hashtext(id::text || ':color')) % 12) + 1]
where avatar_color is null;
