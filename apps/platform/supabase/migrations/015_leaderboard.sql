-- College Leaderboard — paper-trading P&L tracking for verified college students.
-- See docs/PLAN_COLLEGE_LEADERBOARD.md for the full product design.
--
-- Dependencies: requires user_profiles (migration 014) and student_verification
-- (migration 010). Apply those first.

-- Per-user simulated positions. One row per position opened.
CREATE TABLE IF NOT EXISTS leaderboard_positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id       text NOT NULL,                          -- "{platform}:{platform_market_id}"
  outcome_id      text NOT NULL,                          -- which side of the market
  outcome_label   text NOT NULL,                          -- denormalized for display after market changes
  opened_at       timestamptz NOT NULL DEFAULT now(),
  entry_price     numeric(6,5) NOT NULL,                  -- implied prob at open (0-1)
  simulated_stake numeric(12,2) NOT NULL,                 -- $1 to $10000
  resolved_at     timestamptz,
  exit_price      numeric(6,5),
  payout          numeric(12,2),
  pnl             numeric(12,2),
  roi             numeric(8,4),
  status          text NOT NULL DEFAULT 'open',           -- 'open' | 'resolved' | 'voided'

  CONSTRAINT leaderboard_positions_stake_range CHECK (simulated_stake BETWEEN 1 AND 10000),
  CONSTRAINT leaderboard_positions_prob_range CHECK (entry_price BETWEEN 0 AND 1),
  CONSTRAINT leaderboard_positions_status_values CHECK (status IN ('open', 'resolved', 'voided')),
  CONSTRAINT leaderboard_positions_unique_open UNIQUE (user_id, market_id, outcome_id, status)
);

CREATE INDEX IF NOT EXISTS leaderboard_positions_user_idx
  ON leaderboard_positions (user_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS leaderboard_positions_status_idx
  ON leaderboard_positions (status, resolved_at)
  WHERE status = 'open';

-- Opt-in fields on user_profiles. Users join explicitly, keep their historical
-- P&L even if they opt out later (no delete).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS leaderboard_opted_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS leaderboard_display_handle text,
  ADD COLUMN IF NOT EXISTS leaderboard_college text;

-- Handles are globally unique among opted-in users — avoids @TheGOAT collisions.
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_leaderboard_handle_uniq
  ON user_profiles (lower(leaderboard_display_handle))
  WHERE leaderboard_display_handle IS NOT NULL;

-- Aggregated rollup for the leaderboard display. Materialized view for cheap
-- reads; refresh on a cron or after each position resolves.
CREATE MATERIALIZED VIEW IF NOT EXISTS leaderboard_rollup AS
SELECT
  p.user_id,
  up.leaderboard_display_handle AS handle,
  up.leaderboard_college        AS college,
  COUNT(*)                      AS trade_count,
  SUM(p.simulated_stake)        AS total_staked,
  SUM(p.pnl)                    AS total_pnl,
  -- Stake-weighted ROI: SUM(pnl) / SUM(stake). Bigger trades count more,
  -- preventing tiny lucky bets from topping the board.
  SUM(p.pnl) / NULLIF(SUM(p.simulated_stake), 0) AS weighted_roi,
  MAX(p.resolved_at)            AS latest_resolve
FROM leaderboard_positions p
JOIN user_profiles up ON up.user_id = p.user_id
WHERE up.leaderboard_opted_in_at IS NOT NULL
  AND p.status = 'resolved'
GROUP BY p.user_id, up.leaderboard_display_handle, up.leaderboard_college
HAVING COUNT(*) >= 5 AND SUM(p.simulated_stake) >= 100;

-- Required for CONCURRENTLY refresh below.
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_rollup_user_idx
  ON leaderboard_rollup (user_id);

CREATE INDEX IF NOT EXISTS leaderboard_rollup_college_roi_idx
  ON leaderboard_rollup (college, weighted_roi DESC);

CREATE INDEX IF NOT EXISTS leaderboard_rollup_global_roi_idx
  ON leaderboard_rollup (weighted_roi DESC);

-- Convenience helper: refresh the rollup without blocking reads. Call from
-- the resolve cron and the position-resolve code path.
CREATE OR REPLACE FUNCTION refresh_leaderboard_rollup()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_rollup;
END;
$$;
