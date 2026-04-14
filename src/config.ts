// Trading Bot Configuration

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Database
  database: {
    url: process.env.POSTGRES_URL || 'postgresql://localhost:5432/sneakers',
  },

  // APIs - Trading
  alpaca: {
    apiKey: process.env.ALPACA_API_KEY,
    apiSecret: process.env.ALPACA_API_SECRET,
    baseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
  },

  polymarket: {
    privateKey: process.env.POLYMARKET_PRIVATE_KEY,
    rpcUrl: process.env.POLYGON_RPC_URL,
  },

  kalshi: {
    apiKey: process.env.KALSHI_API_KEY,
    apiSecret: process.env.KALSHI_API_SECRET,
  },

  // APIs - Data
  coingecko: {
    // Free API, no key needed
    baseUrl: 'https://api.coingecko.com/api/v3',
  },

  binance: {
    // Free API
    baseUrl: 'https://api.binance.com/api/v3',
    wsUrl: 'wss://stream.binance.com:9443/ws',
  },

  polygon: {
    apiKey: process.env.POLYGON_API_KEY,
  },

  // APIs - News & Signals
  twitter: {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    bearerToken: process.env.TWITTER_BEARER_TOKEN,
  },

  theOdds: {
    apiKey: process.env.THE_ODDS_API_KEY,
  },

  benzinga: {
    apiKey: process.env.BENZINGA_API_KEY,
  },

  public: {
    apiKey: process.env.PUBLIC_API_KEY,
    baseUrl: process.env.PUBLIC_BASE_URL || 'https://api.public.com/userapigateway',
  },

  // Trading Parameters
  trading: {
    paperTrading: process.env.PAPER_TRADING === 'true',
    maxPositionSize: 5000, // $5k per bet
    maxDailyLoss: -5000, // Stop at -$5k
    maxOpenPositions: 10,
    maxTradesPerDay: 100,
    minSpreadThreshold: 2, // 2% minimum spread for arbitrage
    minROIThreshold: 1.5, // 1.5% minimum ROI after fees
  },

  // Markets
  markets: {
    polymarket: {
      minTimeToExpiry: 5 * 60, // 5 minutes
      maxTimeToExpiry: 30 * 60, // 30 minutes
    },
    kalshi: {
      minTimeToExpiry: 15 * 60, // 15 minutes
      maxTimeToExpiry: 60 * 60, // 60 minutes
    },
  },

  // LLM (for signal analysis)
  llm: {
    serviceUrl: process.env.LLM_SERVICE_URL || 'http://localhost:8000',
    fastModel: process.env.FAST_MODEL || 'qwen2.5:7b',
    slowModel: process.env.SLOW_MODEL || 'qwen2.5:7b',
  },

  // Redis (for caching)
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Polling intervals (ms)
  polling: {
    priceFeeds: 5000, // 5 seconds
    marketSnapshots: 10000, // 10 seconds
    arbitrageScans: 10000, // 10 seconds
    portfolioSnapshot: 60000, // 1 minute
    twitterStream: 30000, // 30 seconds
  },

  // Weather Arbitrage
  weather: {
    minEdgeThreshold: 8,          // 8% minimum edge to trade
    maxPositionPerOutcome: 500,   // $500 max per outcome
    forecastRefreshInterval: 300000, // 5 minutes
    scanInterval: 60000,          // 1 minute
    kellyFraction: 0.5,           // Half-Kelly for conservatism
    autoExecute: process.env.WEATHER_AUTO_EXECUTE === 'true',
  },

  // Monitoring
  monitoring: {
    enableLogging: true,
    enableMetrics: true,
    dataFreshnessThreshold: 30000, // 30 seconds
  },
};

export type Config = typeof config;
