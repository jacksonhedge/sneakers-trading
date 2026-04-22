-- Markets catalog — one row per unique market across all providers.
-- Mirrors the Market type we'll consolidate into packages/core/src/ingestion/types.ts.
-- Inserted/upserted by scrapers; updated with last_seen_at on every scrape that
-- sees the market.

create table if not exists markets (
  id              text primary key,             -- "{source}:{platform_market_id}"
  source          text not null,                -- e.g. "polymarket", "kalshi", "novig", "prophetx", "og"
  event_ref       text,                         -- canonical cross-platform key for arb matching (filled later)
  question        text not null,
  category        text not null,                -- basketball | crypto | politics | baseball | hockey | mma | ...
  subcategory     text,                         -- free text from scraper (sport league, sub-topic)
  open_time       timestamptz,
  close_time      timestamptz,                  -- may be null for some perpetual markets
  resolution_criteria text,
  status          text not null,                -- pre_open | open | closed | settled | voided | cancelled
  raw_metadata    jsonb,                        -- anything else we want to keep (tags, wrappers, etc.)
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create index if not exists markets_source_idx on markets (source);
create index if not exists markets_event_ref_idx on markets (event_ref) where event_ref is not null;
create index if not exists markets_close_time_idx on markets (close_time) where status = 'open';
create index if not exists markets_category_idx on markets (category);

-- Outcomes within a market (YES/NO for binary, or N options for multi-outcome)
create table if not exists outcomes (
  market_id       text not null references markets(id) on delete cascade,
  id              text not null,                -- unique within a market (slug of outcome name)
  label           text not null,                -- "Yankees" | "Yes" | "Over 8.5" | "Nikola Jokic"
  primary key (market_id, id)
);

create index if not exists outcomes_market_idx on outcomes (market_id);
