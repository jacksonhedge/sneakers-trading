# Sneakers Trading Bot

Prediction market trading bot for finding and executing extreme probability (97%+) trades on crypto markets.

## Quick Start

```bash
# Install dependencies
npm install

# Start the opportunity hunter (finds 97%+ markets)
npm run hunter

# In another terminal, start the market data logger
npm run logger

# In another terminal, analyze outcomes as markets resolve
npm run momentum
```

## Core Scripts

- **`npm run hunter`** — Find and track 97%+ probability opportunities
- **`npm run logger`** — Continuously capture all market prices and momentum
- **`npm run analyzer`** — Measure win rates by probability band (calibration)
- **`npm run momentum`** — Correlate price momentum near expiry with outcomes
- **`npm run bitcoin`** — Analyze Bitcoin volatility by hour (1-year history)
- **`npm run dashboard`** — Web UI for viewing live trades

## Manual Outcome Logging

After markets resolve, log the outcome:

```bash
npm run log-outcome 90370 YES
npm run log-outcome 90367 NO
npm run log-outcome -- --show    # Show all unresolved
```

## Project Structure

```
src/
├── opportunity-hunter.ts       # Main scanner for 97%+ opportunities
├── limitless-executor.ts       # Places orders on Limitless
├── market-data-logger.ts       # Captures all market prices
├── outcome-analyzer.ts         # Measures calibration (win rates)
├── momentum-analyzer.ts        # Correlates momentum with outcomes
├── log-outcome.ts              # Manual outcome logging
├── bitcoin-analyzer.ts         # Bitcoin volatility analysis
├── dashboard-server.ts         # Web dashboard
└── ...
```

## Data & Logs

All logs are saved to a `logs/` directory (created automatically):
- `logs/market-data/price-history.jsonl` — All price points
- `logs/market-data/market-snapshots.jsonl` — Full market snapshots
- `logs/market-outcomes.json` — Tracked opportunities with outcomes
- `logs/trades-YYYY-MM-DD.json` — Daily executed trades

## Environment Variables

Requires a `.env` file with API keys:

```
LIMITLESS_API_KEY=your_api_key
LIMITLESS_API_SECRET=your_api_secret
CRYPTO_COM_API_KEY=your_key
CRYPTO_COM_API_SECRET=your_secret
```

## Key Features

✅ **Opportunity Hunter** — Finds markets at 97-99%+ probability in final 10 minutes  
✅ **Market Data Logger** — Captures all prices with momentum tracking  
✅ **Outcome Analyzer** — Measures if Limitless probabilities are calibrated correctly  
✅ **Momentum Analyzer** — Finds patterns: which momentum events hurt bets?  
✅ **Bitcoin Analyzer** — Identifies peak volatility hours for prediction markets  

## Typical Workflow

1. Start hunter and logger (runs continuously)
2. Opportunities found are automatically tracked
3. As markets expire, log outcomes manually
4. Run analyzers to find patterns and gaps
5. Use insights to improve trading strategy

See `TRACKING_SYSTEM.md` for detailed instructions.
