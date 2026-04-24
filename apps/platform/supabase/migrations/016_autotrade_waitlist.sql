-- Autotrade feature waitlist. Users opt in from /dashboard/settings/autotrade;
-- we'll email them when the autotrade-tos branch merges + Polymarket
-- integration is live.
--
-- Idempotent: the column is nullable and written once per user on first
-- opt-in. Re-opt-in is a no-op (see /api/me/autotrade-waitlist).

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS autotrade_waitlist_at timestamptz;

CREATE INDEX IF NOT EXISTS user_profiles_autotrade_waitlist_idx
  ON user_profiles (autotrade_waitlist_at)
  WHERE autotrade_waitlist_at IS NOT NULL;
