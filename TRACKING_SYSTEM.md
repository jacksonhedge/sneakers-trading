# Complete Market Tracking System

This system logs all market data and tracks outcomes to find gaps and patterns in prediction market probabilities.

## Components

### 1. **Market Data Logger** (`market-data-logger.ts`)
Continuously captures all active markets from Limitless, including:
- Market prices (YES/NO) at regular intervals
- Time to expiry
- Price momentum (bullish/bearish/flat)
- All metadata

**Start the logger:**
```bash
node --loader ts-node/esm packages/core/src/market-data-logger.ts
```

**Output logs:**
- `logs/market-data/price-history.jsonl` — Every price point across all markets
- `logs/market-data/market-snapshots.jsonl` — Full market snapshots with momentum

### 2. **Opportunity Hunter** (`opportunity-hunter.ts`)
Finds markets at 97%+ probability and tracks them for outcome analysis.

**Start the hunter:**
```bash
node --loader ts-node/esm packages/core/src/opportunity-hunter.ts
```

**Tracks:**
- `logs/trades-YYYY-MM-DD.json` — Executed trades
- `logs/market-outcomes.json` — All tracked opportunities (outcomes pending)

### 3. **Outcome Logger** (`log-outcome.ts`)
Manually log resolved market outcomes after you check the Limitless web UI.

**Log a market outcome:**
```bash
node --loader ts-node/esm packages/core/src/log-outcome.ts 90370 YES
node --loader ts-node/esm packages/core/src/log-outcome.ts 90367 NO
```

**Show unresolved markets:**
```bash
node --loader ts-node/esm packages/core/src/log-outcome.ts --show
```

### 4. **Outcome Analyzer** (`outcome-analyzer.ts`)
Analyzes win rates by probability band to measure calibration.

**Run analysis:**
```bash
node --loader ts-node/esm packages/core/src/outcome-analyzer.ts
```

**Shows:**
- Win rate for 99% markets (should be ~99%)
- Win rate for 98% markets (should be ~98%)
- Calibration error (difference between predicted vs actual)

### 5. **Momentum Analyzer** (`momentum-analyzer.ts`)
Correlates price momentum near expiry with whether high-probability markets resolved correctly.

**Run analysis:**
```bash
node --loader ts-node/esm packages/core/src/momentum-analyzer.ts
```

**Identifies:**
- Price momentum (bullish/bearish/flat) in final minute
- Significant price gaps near expiry
- Whether momentum aligned with prediction
- Patterns in winning vs losing markets

## Workflow

### Daily Operations

1. **Start the logger** (once at beginning of day):
   ```bash
   node --loader ts-node/esm packages/core/src/market-data-logger.ts &
   ```

2. **Start the hunter** (once at beginning of day):
   ```bash
   node --loader ts-node/esm packages/core/src/opportunity-hunter.ts &
   ```

3. **Log outcomes** (as markets expire):
   ```bash
   # Check Limitless web UI every few hours
   # For each expired market, log the result:
   node --loader ts-node/esm packages/core/src/log-outcome.ts <market_id> <YES|NO>
   ```

4. **Analyze patterns** (daily or as data accumulates):
   ```bash
   # Check calibration
   node --loader ts-node/esm packages/core/src/outcome-analyzer.ts

   # Check momentum patterns
   node --loader ts-node/esm packages/core/src/momentum-analyzer.ts
   ```

## Data Files

All data is stored in:
- `logs/market-data/price-history.jsonl` — Line-delimited JSON, each line is one price point
- `logs/market-data/market-snapshots.jsonl` — Line-delimited JSON, full market snapshots
- `logs/market-outcomes.json` — Array of all tracked opportunities with outcomes
- `logs/trades-YYYY-MM-DD.json` — Daily trade execution logs

## Analysis Examples

### Finding Gap Markets
"Which markets had price gaps near expiry and did they lose?"
→ Run `momentum-analyzer.ts`, look for gaps and correlate with losses

### Checking Calibration
"Are 98% markets really 98% accurate?"
→ Run `outcome-analyzer.ts`, check win rate for 98-99% band

### Finding Momentum Patterns
"Do bullish price movements hurt bearish bets near expiry?"
→ Run `momentum-analyzer.ts`, compare momentum direction with outcome

## Sample Output

**Outcome Analyzer:**
```
📊 MARKET OUTCOME ANALYSIS BY PROBABILITY BAND

Probability | Total | Resolved | Wins | Losses | Win Rate | Expected | Calibration Error
─────────────┼───────┼──────────┼──────┼────────┼──────────┼──────────┼───────────────────
 99-100% (LOCKS) |    18 |       16 |   16 |      0 |    100.0% |    99.5% |              0.5%
 98-99% (HAMMERS) |    25 |       22 |   21 |      1 |     95.5% |    98.5% |              3.0%
 97-98% (GOOD) |    32 |       28 |   26 |      2 |     92.9% |    97.5% |              4.6%
```

**Momentum Analyzer:**
```
🟢 WINNING MARKETS:
   90370 | BTC YES @ 98.5% → YES | Momentum: BULLISH ✅
   90367 | ETH NO @ 97.2% → NO | Momentum: BEARISH ✅

🔴 LOSING MARKETS:
   90403 | SOL YES @ 99.1% → NO | Momentum: BEARISH ⚠️ 
      └─ 10s→expiry gap: 0.125

💡 GAPS ANALYSIS:
   Found 3 significant gaps in markets
   • 1m→30s gap: 0.089
   • 10s→expiry gap: 0.125
```

## Next Steps

Once you have:
1. Historical price data (several hours minimum)
2. Market outcomes (10+ resolved markets)
3. Analysis results

You can identify:
- **Toxic markets** (high probability markets that frequently lose due to momentum)
- **Safe markets** (high probability markets with good momentum alignment)
- **Best hunting hours** (combine with bitcoin-analyzer.ts results)
- **Gap patterns** (when price gaps appear, do bets fail more often?)
