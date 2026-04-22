-- 012_alerts.sql
-- Notification engine: user-constructible rules + firing history + browser
-- push subscriptions + per-user delivery preferences.
--
-- Source brief: docs/HANDOFF_NOTIFICATIONS.md.
--
-- Schema notes:
--   - All FKs key on waitlist.id (uuid). Matches the established repo
--     convention (enterprise_inquiries, student_verification). The cron
--     evaluator joins from waitlist row → email → auth.users for delivery.
--   - trigger_config and market_filter are JSONB. Application-level
--     validation in lib/alerts/validate.ts enforces the per-trigger-type
--     shape; the DB only enforces enum membership of trigger_type.
--   - alert_events.trigger_snapshot is intentionally small (4-5 fields)
--     to keep JSONB read-cheap. The full snapshot lives in the JSONL
--     scrape archive.
--   - push_subscriptions has unique (user_id, endpoint) so re-subscribing
--     the same browser is idempotent.

create table if not exists public.alert_rules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.waitlist(id) on delete cascade,
  name             text not null,
  description      text,
  trigger_type     text not null check (trigger_type in (
    'price_threshold','price_movement','overround_threshold','arb_appearance'
  )),
  trigger_config   jsonb not null,
  market_filter    jsonb not null default '{}'::jsonb,
  channels         text[] not null default array['browser_push','email']::text[],
  cooldown_minutes int not null default 60 check (cooldown_minutes >= 5),
  enabled          boolean not null default true,
  last_fired_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists alert_rules_user_enabled_idx
  on public.alert_rules (user_id, enabled);
create index if not exists alert_rules_trigger_type_idx
  on public.alert_rules (trigger_type)
  where enabled = true;

comment on table public.alert_rules is
  'User-constructible notification rules. The cron evaluators '
  '(/api/cron/evaluate-standard for Pro/Elite/Fraternity, '
  '/api/cron/evaluate-business for Business) load enabled rules and '
  'invoke trigger_type-matched evaluators in lib/alerts/triggers.ts.';
comment on column public.alert_rules.trigger_config is
  'Per-trigger config blob. Validated server-side by '
  'lib/alerts/validate.ts on insert/update — DB only enforces the enum.';
comment on column public.alert_rules.market_filter is
  'AND-composed filter: {platform?, sport?, category?, market_key?}. '
  'At least one field required (validated server-side). Empty filter '
  'is rejected to prevent unbounded "match everything" rules.';
comment on column public.alert_rules.channels is
  'Subset of (browser_push, email). v2 adds sms, webhook, slack, discord.';
comment on column public.alert_rules.cooldown_minutes is
  'Minimum gap between fires for this rule. Hard floor 5 — even Business.';
comment on column public.alert_rules.last_fired_at is
  'Updated by the cron handler on every fire. Drives cooldown checks.';

create table if not exists public.alert_events (
  id               uuid primary key default gen_random_uuid(),
  rule_id          uuid not null references public.alert_rules(id) on delete cascade,
  user_id          uuid not null references public.waitlist(id) on delete cascade,
  fired_at         timestamptz not null default now(),
  market_key       text not null,
  trigger_snapshot jsonb not null,
  channels_sent    text[] not null default array[]::text[],
  delivery_status  jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists alert_events_rule_fired_idx
  on public.alert_events (rule_id, fired_at desc);
create index if not exists alert_events_user_fired_idx
  on public.alert_events (user_id, fired_at desc);

comment on table public.alert_events is
  'Append-only firing history. delivery_status is per-channel '
  'pass/fail/skipped JSON. Drives /admin/alerts observability + '
  'per-rule history view.';
comment on column public.alert_events.market_key is
  '"<platform>:<market_id>" of the market that satisfied the trigger.';
comment on column public.alert_events.trigger_snapshot is
  '4-5 fields max — current price, prior price, overround, etc. '
  'Full snapshot lives in the JSONL archive under '
  'apps/trader/data/<platform>/<date>.jsonl.';

create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.waitlist(id) on delete cascade,
  endpoint         text not null,
  p256dh_key       text not null,
  auth_key         text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_used_at     timestamptz,
  unique (user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Web Push API subscriptions. One row per (user, browser/device). '
  'Cron handler dispatches via web-push npm package; on 404/410 '
  'response, deletes the subscription (user revoked).';

create table if not exists public.alert_delivery_prefs (
  user_id              uuid primary key references public.waitlist(id) on delete cascade,
  email_enabled        boolean not null default true,
  email_digest_mode    boolean not null default false,
  push_enabled         boolean not null default true,
  quiet_hours_start    int check (quiet_hours_start between 0 and 23),
  quiet_hours_end      int check (quiet_hours_end between 0 and 23),
  quiet_hours_tz       text not null default 'America/New_York',
  updated_at           timestamptz not null default now()
);

comment on table public.alert_delivery_prefs is
  'Per-user delivery preferences. Quiet hours defer (skip + re-fire '
  'next cycle); they do not suppress. v1 sends one email per fire even '
  'when email_digest_mode is true — true batching is deferred.';

-- updated_at touch triggers
create or replace function public.touch_alert_rule()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists alert_rules_touch on public.alert_rules;
create trigger alert_rules_touch before update on public.alert_rules
  for each row execute function public.touch_alert_rule();

create or replace function public.touch_alert_delivery_prefs()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists alert_delivery_prefs_touch on public.alert_delivery_prefs;
create trigger alert_delivery_prefs_touch before update on public.alert_delivery_prefs
  for each row execute function public.touch_alert_delivery_prefs();

-- RLS — users see only their own rows. Cron uses service role to bypass.
alter table public.alert_rules            enable row level security;
alter table public.alert_events           enable row level security;
alter table public.push_subscriptions     enable row level security;
alter table public.alert_delivery_prefs   enable row level security;

-- Helper: resolve auth.email() → waitlist row id. The cron handler doesn't
-- use this (service role); the policies below do.
create or replace function public.current_waitlist_user_id()
returns uuid language sql stable as $$
  select id from public.waitlist
  where lower(email) = lower((auth.jwt() ->> 'email'))
  limit 1
$$;

create policy alert_rules_self_all on public.alert_rules
  for all using (user_id = public.current_waitlist_user_id())
  with check (user_id = public.current_waitlist_user_id());

create policy alert_events_self_read on public.alert_events
  for select using (user_id = public.current_waitlist_user_id());

create policy push_subscriptions_self_all on public.push_subscriptions
  for all using (user_id = public.current_waitlist_user_id())
  with check (user_id = public.current_waitlist_user_id());

create policy alert_delivery_prefs_self_all on public.alert_delivery_prefs
  for all using (user_id = public.current_waitlist_user_id())
  with check (user_id = public.current_waitlist_user_id());
