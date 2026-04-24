-- 013_invite_scarcity.sql
-- Referral V2 (Clubhouse-style incentive layer) — M1: invite scarcity UI.
-- Adds `invite_slots_total` to waitlist. UI-side "invites remaining" is
-- computed as `max(0, invite_slots_total - direct_referrals)`.
--
-- Default budget is 3 per user. The link itself has no backend gating —
-- extra claims beyond the budget still work and increment direct_referrals
-- as before. The scarcity is psychological, reflected only in the post-signup
-- card, status page, and leaderboard UI.
--
-- Refill mechanism (weekly cron + tier/Verified-Operator bonuses) is NOT
-- part of M1; later migrations grow this column per user.

alter table public.waitlist
  add column if not exists invite_slots_total int not null default 3;

-- Existing rows get the default automatically. No backfill statement needed.
