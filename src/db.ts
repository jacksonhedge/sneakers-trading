// SQLite Database — single source of truth for all market data
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'markets.db');

const db = new Database(DB_PATH);

// Performance: WAL mode + pragmas for a local analytics workload
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  -- Every price observation we capture (high-frequency, append-only)
  CREATE TABLE IF NOT EXISTS market_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id     TEXT    NOT NULL,
    platform      TEXT    NOT NULL,  -- 'Limitless', 'Crypto.com', 'Polymarket', 'Kalshi'
    category      TEXT    NOT NULL,  -- 'crypto', 'sports', 'politics', 'quick', 'other'
    asset         TEXT    NOT NULL,  -- 'BTC', 'ETH', etc.
    title         TEXT,
    yes_price     REAL,
    no_price      REAL,
    probability   REAL    NOT NULL,  -- the extreme-side probability we're tracking
    side          TEXT    NOT NULL,  -- 'YES' or 'NO'
    volume        REAL    DEFAULT 0,
    liquidity     REAL    DEFAULT 0,
    spread        REAL    DEFAULT 0,
    seconds_to_expiry REAL NOT NULL,
    expiry_time   INTEGER NOT NULL,  -- epoch ms
    observed_at   INTEGER NOT NULL   -- epoch ms
  );

  -- One row per resolved market (de-duped by market_id + side)
  CREATE TABLE IF NOT EXISTS market_outcomes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id           TEXT    NOT NULL,
    platform            TEXT    NOT NULL,
    category            TEXT    NOT NULL,
    asset               TEXT    NOT NULL,
    title               TEXT,
    -- Best observation: the snapshot closest to expiry
    probability         REAL    NOT NULL,
    side                TEXT    NOT NULL,
    seconds_to_expiry   REAL,
    volume              REAL    DEFAULT 0,
    liquidity           REAL    DEFAULT 0,
    spread              REAL    DEFAULT 0,
    expiry_time         INTEGER NOT NULL,
    -- Resolution
    actual_outcome      TEXT,         -- 'YES' or 'NO'
    result              TEXT,         -- 'WIN' or 'LOSS'
    resolved_at         INTEGER,
    UNIQUE(market_id, side)
  );

  -- Executed / logged trades
  CREATE TABLE IF NOT EXISTS trades (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id       TEXT    NOT NULL,
    platform        TEXT    NOT NULL,
    asset           TEXT    NOT NULL,
    side            TEXT    NOT NULL,
    probability     REAL    NOT NULL,
    position_size   REAL    NOT NULL,
    estimated_return REAL,
    actual_pnl      REAL,
    status          TEXT    NOT NULL,  -- 'SUCCESS', 'FAILED', 'PENDING'
    executed_at     INTEGER NOT NULL
  );

  -- Indexes for analytical queries
  CREATE INDEX IF NOT EXISTS idx_snap_market     ON market_snapshots(market_id, observed_at);
  CREATE INDEX IF NOT EXISTS idx_snap_platform   ON market_snapshots(platform, observed_at);
  CREATE INDEX IF NOT EXISTS idx_snap_prob       ON market_snapshots(probability);
  CREATE INDEX IF NOT EXISTS idx_snap_expiry     ON market_snapshots(expiry_time);
  CREATE INDEX IF NOT EXISTS idx_snap_asset_time ON market_snapshots(asset, observed_at);
  CREATE INDEX IF NOT EXISTS idx_snap_cat        ON market_snapshots(category, observed_at);

  CREATE INDEX IF NOT EXISTS idx_out_platform    ON market_outcomes(platform);
  CREATE INDEX IF NOT EXISTS idx_out_prob        ON market_outcomes(probability);
  CREATE INDEX IF NOT EXISTS idx_out_result      ON market_outcomes(result);
  CREATE INDEX IF NOT EXISTS idx_out_cat         ON market_outcomes(category);
  CREATE INDEX IF NOT EXISTS idx_out_asset       ON market_outcomes(asset);

  -- Weather forecast tracking for calibration
  CREATE TABLE IF NOT EXISTS weather_forecasts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    location        TEXT    NOT NULL,
    target_date     TEXT    NOT NULL,
    forecast_high_f REAL,
    forecast_low_f  REAL,
    model_spread_f  REAL,
    hours_until_target REAL,
    actual_high_f   REAL,
    actual_low_f    REAL,
    forecast_error_f REAL,
    observed_at     INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_wf_location ON weather_forecasts(location, target_date);
  CREATE INDEX IF NOT EXISTS idx_wf_date     ON weather_forecasts(target_date);

  -- Weather market price ticks: every price observation for every temperature outcome
  CREATE TABLE IF NOT EXISTS weather_price_ticks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    location        TEXT    NOT NULL,
    target_date     TEXT    NOT NULL,
    outcome_label   TEXT    NOT NULL,    -- '15°C', '16°C or below', etc.
    temperature_c   INTEGER NOT NULL,
    yes_price       REAL    NOT NULL,    -- market price (0-1)
    forecast_prob   REAL,               -- our ensemble probability at this moment
    edge            REAL,               -- forecast_prob - yes_price
    hours_to_expiry REAL    NOT NULL,
    condition_id    TEXT,
    observed_at     INTEGER NOT NULL     -- epoch ms
  );

  CREATE INDEX IF NOT EXISTS idx_wpt_loc_date ON weather_price_ticks(location, target_date, observed_at);
  CREATE INDEX IF NOT EXISTS idx_wpt_outcome  ON weather_price_ticks(outcome_label, observed_at);
  CREATE INDEX IF NOT EXISTS idx_wpt_time     ON weather_price_ticks(observed_at);

  -- Weather market resolutions: one row per resolved temperature outcome
  CREATE TABLE IF NOT EXISTS weather_resolutions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    location        TEXT    NOT NULL,
    target_date     TEXT    NOT NULL,
    actual_high_c   INTEGER,
    actual_high_f   REAL,
    -- Per-outcome results
    outcome_label   TEXT    NOT NULL,
    temperature_c   INTEGER NOT NULL,
    final_market_price REAL,           -- last price before resolution
    our_forecast_prob  REAL,           -- our final ensemble probability
    resolved_yes    INTEGER NOT NULL,  -- 1 if this was the winning outcome, 0 otherwise
    -- Accuracy tracking
    market_was_right INTEGER,          -- 1 if market > 50% and resolved yes, or < 50% and no
    model_was_right  INTEGER,          -- same for our forecast
    profit_if_traded REAL,             -- hypothetical PnL based on edge at last observation
    resolved_at     INTEGER NOT NULL,
    UNIQUE(location, target_date, outcome_label)
  );

  CREATE INDEX IF NOT EXISTS idx_wr_loc     ON weather_resolutions(location, target_date);
  CREATE INDEX IF NOT EXISTS idx_wr_date    ON weather_resolutions(target_date);
  CREATE INDEX IF NOT EXISTS idx_wr_result  ON weather_resolutions(resolved_yes);
`);

// ─── Prepared Statements ─────────────────────────────────────────────────────

const insertSnapshot = db.prepare(`
  INSERT INTO market_snapshots
    (market_id, platform, category, asset, title, yes_price, no_price,
     probability, side, volume, liquidity, spread, seconds_to_expiry,
     expiry_time, observed_at)
  VALUES
    (@market_id, @platform, @category, @asset, @title, @yes_price, @no_price,
     @probability, @side, @volume, @liquidity, @spread, @seconds_to_expiry,
     @expiry_time, @observed_at)
`);

const upsertOutcome = db.prepare(`
  INSERT INTO market_outcomes
    (market_id, platform, category, asset, title, probability, side,
     seconds_to_expiry, volume, liquidity, spread, expiry_time)
  VALUES
    (@market_id, @platform, @category, @asset, @title, @probability, @side,
     @seconds_to_expiry, @volume, @liquidity, @spread, @expiry_time)
  ON CONFLICT(market_id, side) DO UPDATE SET
    probability       = CASE WHEN excluded.seconds_to_expiry < market_outcomes.seconds_to_expiry
                              THEN excluded.probability ELSE market_outcomes.probability END,
    seconds_to_expiry = CASE WHEN excluded.seconds_to_expiry < market_outcomes.seconds_to_expiry
                              THEN excluded.seconds_to_expiry ELSE market_outcomes.seconds_to_expiry END,
    volume            = CASE WHEN excluded.volume > market_outcomes.volume
                              THEN excluded.volume ELSE market_outcomes.volume END,
    liquidity         = CASE WHEN excluded.liquidity > market_outcomes.liquidity
                              THEN excluded.liquidity ELSE market_outcomes.liquidity END
`);

const resolveOutcome = db.prepare(`
  UPDATE market_outcomes
  SET actual_outcome = @actual_outcome,
      result         = @result,
      resolved_at    = @resolved_at
  WHERE market_id = @market_id AND side = @side AND actual_outcome IS NULL
`);

const insertTrade = db.prepare(`
  INSERT INTO trades
    (market_id, platform, asset, side, probability, position_size,
     estimated_return, status, executed_at)
  VALUES
    (@market_id, @platform, @asset, @side, @probability, @position_size,
     @estimated_return, @status, @executed_at)
`);

const insertWeatherForecast = db.prepare(`
  INSERT INTO weather_forecasts
    (location, target_date, forecast_high_f, forecast_low_f, model_spread_f,
     hours_until_target, observed_at)
  VALUES
    (@location, @target_date, @forecast_high_f, @forecast_low_f, @model_spread_f,
     @hours_until_target, @observed_at)
`);

const updateWeatherActual = db.prepare(`
  UPDATE weather_forecasts
  SET actual_high_f = @actual_high_f,
      actual_low_f  = @actual_low_f,
      forecast_error_f = @forecast_error_f
  WHERE location = @location AND target_date = @target_date AND actual_high_f IS NULL
`);

const insertPriceTick = db.prepare(`
  INSERT INTO weather_price_ticks
    (location, target_date, outcome_label, temperature_c, yes_price,
     forecast_prob, edge, hours_to_expiry, condition_id, observed_at)
  VALUES
    (@location, @target_date, @outcome_label, @temperature_c, @yes_price,
     @forecast_prob, @edge, @hours_to_expiry, @condition_id, @observed_at)
`);

const insertPriceTickBatch = db.transaction((ticks: any[]) => {
  for (const t of ticks) insertPriceTick.run(t);
});

const insertWeatherResolution = db.prepare(`
  INSERT OR REPLACE INTO weather_resolutions
    (location, target_date, actual_high_c, actual_high_f, outcome_label, temperature_c,
     final_market_price, our_forecast_prob, resolved_yes, market_was_right,
     model_was_right, profit_if_traded, resolved_at)
  VALUES
    (@location, @target_date, @actual_high_c, @actual_high_f, @outcome_label, @temperature_c,
     @final_market_price, @our_forecast_prob, @resolved_yes, @market_was_right,
     @model_was_right, @profit_if_traded, @resolved_at)
`);

// Batch insert for snapshots (much faster than individual inserts)
const insertSnapshotBatch = db.transaction((snapshots: any[]) => {
  for (const s of snapshots) insertSnapshot.run(s);
});

const upsertOutcomeBatch = db.transaction((outcomes: any[]) => {
  for (const o of outcomes) upsertOutcome.run(o);
});

// ─── Public API ──────────────────────────────────────────────────────────────

export {
  db,
  DB_PATH,
  insertSnapshot,
  insertSnapshotBatch,
  upsertOutcome,
  upsertOutcomeBatch,
  resolveOutcome,
  insertTrade,
  insertWeatherForecast,
  updateWeatherActual,
  insertPriceTick,
  insertPriceTickBatch,
  insertWeatherResolution,
};

export default db;
