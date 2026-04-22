-- Fine-grained price tick data. One row per observation per outcome.
-- Hypertable partitioned by time, compressed after 7 days, retained 180 days.
-- Aggregates (migration 003) keep longer summaries.

create table if not exists price_observations (
  observed_at     timestamptz not null,
  market_id       text not null,
  outcome_id      text not null,

  implied_prob    numeric(6,5),                 -- 0.00000 - 1.00000 (typically best_ask in prob space)
  best_bid        numeric(6,5),
  best_ask        numeric(6,5),
  last_price      numeric(6,5),

  overround       numeric(6,5),                 -- sum of asks across outcomes; denormalized for cheap filter
  liquidity_usd   numeric(14,2),
  volume_traded   numeric(14,2),                -- platform-native; scraper-specific units, sometimes in contracts

  raw_price_format text,                         -- 'probability' | 'american' | 'decimal' (all our scrapers normalize to probability)
  raw_price_value  numeric(14,4),                -- original untransformed number if meaningful (e.g., American odds)

  seq             bigint,                        -- monotonic per (market, outcome) for dropped-message detection

  -- No FK on (market_id, outcome_id) deliberately — observations can arrive before
  -- the catalog row on race conditions. Reconcile via a periodic backfill job.
  primary key (observed_at, market_id, outcome_id)
);

-- Partition by observed_at into 1-day chunks.
select create_hypertable('price_observations', 'observed_at', chunk_time_interval => interval '1 day', if_not_exists => true);

-- Fast per-market range scans ("show me Kalshi NBA Finals MVP prices last 6h").
create index if not exists price_obs_market_time_idx
  on price_observations (market_id, observed_at desc);

create index if not exists price_obs_market_outcome_time_idx
  on price_observations (market_id, outcome_id, observed_at desc);

-- Columnar compression for chunks >7 days old. Segment by market+outcome because
-- that's how users query (one market's history over time).
alter table price_observations set (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'market_id, outcome_id',
  timescaledb.compress_orderby = 'observed_at desc'
);

select add_compression_policy('price_observations', interval '7 days', if_not_exists => true);

-- Drop raw observations older than 180 days. Aggregates below keep longer.
select add_retention_policy('price_observations', interval '180 days', if_not_exists => true);
