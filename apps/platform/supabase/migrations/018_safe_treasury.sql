-- Safe multisig treasury — chapter-pooled wallet for prediction-market funds.
-- See docs/PLAN_GROUPS_AND_PRODUCT_SPLIT.md "Path A — Polymarket treasury".
--
-- Right now we attach the treasury to a user (the captain's profile). Once
-- the Groups MVP ships (migration 016 + group memberships), we'll migrate
-- this to live on leaderboard_groups so the treasury follows the chapter,
-- not the captain.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS safe_treasury_address text,
  ADD COLUMN IF NOT EXISTS safe_treasury_chain text DEFAULT 'polygon',
  ADD COLUMN IF NOT EXISTS safe_treasury_added_at timestamptz;

-- Cheap lookup for "find user by treasury address" — used when reconciling
-- on-chain Polymarket positions back to a chapter / user.
CREATE INDEX IF NOT EXISTS user_profiles_safe_treasury_idx
  ON user_profiles (lower(safe_treasury_address))
  WHERE safe_treasury_address IS NOT NULL;
