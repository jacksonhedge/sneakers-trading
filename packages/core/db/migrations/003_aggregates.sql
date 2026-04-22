-- Continuous aggregates — auto-updating OHLC bars derived from raw observations.
-- Timescale incrementally refreshes these, so SELECTs on the aggregates are
-- basically free compared to aggregating raw rows on every query.

-- 1-minute bars — finest, used for short-term drift views. Retained 30 days.
create materialized view if not exists price_bars_1m
with (timescaledb.continuous) as
select
  market_id,
  outcome_id,
  time_bucket('1 minute', observed_at) as bucket,
  first(implied_prob, observed_at) as open,
  max(implied_prob) as high,
  min(implied_prob) as low,
  last(implied_prob, observed_at) as close,
  count(*) as obs_count,
  avg(liquidity_usd) as avg_liquidity,
  avg(volume_traded) as avg_volume,
  max(overround) as max_overround
from price_observations
group by market_id, outcome_id, bucket
with no data;

select add_continuous_aggregate_policy('price_bars_1m',
  start_offset => interval '3 hours',
  end_offset   => interval '1 minute',
  schedule_interval => interval '1 minute',
  if_not_exists => true);

-- 5-minute bars — medium horizon. Retained 180 days.
create materialized view if not exists price_bars_5m
with (timescaledb.continuous) as
select
  market_id,
  outcome_id,
  time_bucket('5 minutes', observed_at) as bucket,
  first(implied_prob, observed_at) as open,
  max(implied_prob) as high,
  min(implied_prob) as low,
  last(implied_prob, observed_at) as close,
  count(*) as obs_count,
  avg(liquidity_usd) as avg_liquidity,
  avg(volume_traded) as avg_volume,
  max(overround) as max_overround
from price_observations
group by market_id, outcome_id, bucket
with no data;

select add_continuous_aggregate_policy('price_bars_5m',
  start_offset => interval '6 hours',
  end_offset   => interval '5 minutes',
  schedule_interval => interval '5 minutes',
  if_not_exists => true);

-- 1-hour bars — long-term trend. Retained indefinitely (valuable for data products).
create materialized view if not exists price_bars_1h
with (timescaledb.continuous) as
select
  market_id,
  outcome_id,
  time_bucket('1 hour', observed_at) as bucket,
  first(implied_prob, observed_at) as open,
  max(implied_prob) as high,
  min(implied_prob) as low,
  last(implied_prob, observed_at) as close,
  count(*) as obs_count,
  avg(liquidity_usd) as avg_liquidity,
  avg(volume_traded) as avg_volume,
  max(overround) as max_overround
from price_observations
group by market_id, outcome_id, bucket
with no data;

select add_continuous_aggregate_policy('price_bars_1h',
  start_offset => interval '48 hours',
  end_offset   => interval '1 hour',
  schedule_interval => interval '1 hour',
  if_not_exists => true);

-- Retention policies on the aggregates themselves.
select add_retention_policy('price_bars_1m', interval '30 days', if_not_exists => true);
select add_retention_policy('price_bars_5m', interval '180 days', if_not_exists => true);
-- No retention policy on price_bars_1h — keep forever. This is the data-product surface.
