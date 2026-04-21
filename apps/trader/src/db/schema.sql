-- Sneakers Trading Bot - PostgreSQL Schema

-- Enable JSON support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "jsonb";

-- Events table: Market events from news/Twitter
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source VARCHAR(50) NOT NULL, -- 'twitter', 'news_feed', 'webhook'
  timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content TEXT NOT NULL,
  tickers TEXT[] NOT NULL DEFAULT '{}', -- ['BTC', 'ETH']
  markets JSONB, -- {market_id, platform}
  priority INTEGER DEFAULT 0, -- 0=low, 1=medium, 2=high
  event_type VARCHAR(50) NOT NULL, -- 'price_move', 'news', 'liquidation'
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_processed ON events(processed);
CREATE INDEX idx_events_tickers ON events USING GIN(tickers);

-- Price feeds table: Real-time BTC/ETH prices
CREATE TABLE price_feeds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(10) NOT NULL, -- 'BTC', 'ETH'
  source VARCHAR(50) NOT NULL, -- 'coingecko', 'kraken', 'binance'
  price DECIMAL(20, 8) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  market_cap DECIMAL(30, 0),
  volume_24h DECIMAL(30, 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_price_feeds_symbol_timestamp ON price_feeds(symbol, timestamp DESC);
CREATE INDEX idx_price_feeds_source ON price_feeds(source);

-- Market snapshots: Bid/ask spreads for arbitrage detection
CREATE TABLE market_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id VARCHAR(100) NOT NULL,
  platform VARCHAR(20) NOT NULL, -- 'polymarket', 'kalshi'
  asset VARCHAR(20) NOT NULL, -- 'BTC', 'ETH'
  outcome VARCHAR(100) NOT NULL, -- 'BTC above $100k', 'Yes', 'No'
  bid_price DECIMAL(10, 8) NOT NULL,
  ask_price DECIMAL(10, 8) NOT NULL,
  implied_probability DECIMAL(5, 4), -- 0.0000 to 1.0000
  liquidity DECIMAL(20, 8),
  time_to_expiry_seconds INTEGER,
  expires_at TIMESTAMPTZ,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_market_snapshots_platform_asset ON market_snapshots(platform, asset, timestamp DESC);
CREATE INDEX idx_market_snapshots_expires ON market_snapshots(expires_at);

-- Arbitrage opportunities: Detected spread opportunities
CREATE TABLE arbitrage_opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset VARCHAR(20) NOT NULL,
  polymarket_id VARCHAR(100),
  kalshi_id VARCHAR(100),
  poly_price DECIMAL(10, 8),
  kalshi_price DECIMAL(10, 8),
  spread_pct DECIMAL(8, 4), -- percentage difference
  roi_potential DECIMAL(8, 4),
  poly_expires_at TIMESTAMPTZ,
  kalshi_expires_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  executed BOOLEAN DEFAULT FALSE,
  trade_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_arb_opp_spread ON arbitrage_opportunities(spread_pct DESC, detected_at DESC);
CREATE INDEX idx_arb_opp_executed ON arbitrage_opportunities(executed, detected_at);

-- Trades table
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform VARCHAR(20) NOT NULL, -- 'polymarket', 'kalshi', 'alpaca'
  market_id VARCHAR(100) NOT NULL,
  side VARCHAR(10) NOT NULL, -- 'buy', 'sell'
  outcome VARCHAR(100),
  size DECIMAL(20, 8) NOT NULL, -- number of shares/contracts
  entry_price DECIMAL(20, 8) NOT NULL,
  exit_price DECIMAL(20, 8),
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'closed', 'cancelled'
  pnl DECIMAL(20, 8),
  pnl_pct DECIMAL(8, 4),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_opened_at ON trades(opened_at DESC);
CREATE INDEX idx_trades_platform ON trades(platform);

-- Positions table: Currently open positions
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform VARCHAR(20) NOT NULL,
  market_id VARCHAR(100) NOT NULL,
  side VARCHAR(10) NOT NULL, -- 'long', 'short'
  outcome VARCHAR(100),
  size DECIMAL(20, 8) NOT NULL,
  avg_entry_price DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  unrealized_pnl DECIMAL(20, 8),
  unrealized_pnl_pct DECIMAL(8, 4),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_positions_platform ON positions(platform);
CREATE INDEX idx_positions_market_id ON positions(market_id);

-- Portfolio snapshots: Daily/hourly snapshots
CREATE TABLE portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform VARCHAR(20) NOT NULL,
  cash_balance DECIMAL(20, 2) NOT NULL,
  total_positions_value DECIMAL(20, 2) NOT NULL,
  total_value DECIMAL(20, 2) NOT NULL, -- cash + positions
  daily_pnl DECIMAL(20, 2),
  daily_pnl_pct DECIMAL(8, 4),
  total_pnl DECIMAL(20, 2), -- cumulative
  total_pnl_pct DECIMAL(8, 4),
  max_drawdown DECIMAL(20, 2),
  drawdown_pct DECIMAL(8, 4),
  num_open_positions INTEGER,
  num_open_trades INTEGER,
  snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_portfolio_snapshots_platform_time ON portfolio_snapshots(platform, snapshotted_at DESC);

-- Daily limits: Risk management per day
CREATE TABLE daily_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  max_daily_loss DECIMAL(20, 2) DEFAULT -5000.00, -- stop at -$5k loss
  max_daily_gain DECIMAL(20, 2) DEFAULT 50000.00,
  max_position_size DECIMAL(20, 2) DEFAULT 5000.00, -- $5k per bet
  max_open_positions INTEGER DEFAULT 10,
  max_trades_per_day INTEGER DEFAULT 100,
  realized_pnl DECIMAL(20, 2) DEFAULT 0.00,
  realized_loss DECIMAL(20, 2) DEFAULT 0.00,
  num_trades INTEGER DEFAULT 0,
  num_positions INTEGER DEFAULT 0,
  trading_allowed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, date)
);

CREATE INDEX idx_daily_limits_platform_date ON daily_limits(platform, date DESC);

-- Liquidations & whale alerts (on-chain data)
CREATE TABLE liquidation_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(10) NOT NULL,
  exchange VARCHAR(50),
  liquidation_price DECIMAL(20, 8),
  liquidation_amount DECIMAL(20, 8),
  direction VARCHAR(10), -- 'long', 'short'
  severity VARCHAR(20), -- 'low', 'medium', 'high'
  timestamp TIMESTAMPTZ NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_liquidation_alerts_symbol ON liquidation_alerts(symbol, timestamp DESC);
CREATE INDEX idx_liquidation_alerts_processed ON liquidation_alerts(processed);

-- Market funding rates (leverage sentiment)
CREATE TABLE funding_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(10) NOT NULL,
  exchange VARCHAR(50),
  funding_rate DECIMAL(10, 8),
  open_interest DECIMAL(30, 0),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_funding_rates_symbol_timestamp ON funding_rates(symbol, timestamp DESC);

-- Monitoring: Track API calls and data freshness
CREATE TABLE data_monitoring (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'healthy', -- 'healthy', 'degraded', 'failed'
  last_update TIMESTAMPTZ,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_data_monitoring_source ON data_monitoring(source);
