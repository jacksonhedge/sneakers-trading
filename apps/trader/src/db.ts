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
};

export default db;
