// Manual outcome logger - for tracking resolved market results

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MarketOutcome {
  market_id: string;
  predicted_probability: number;
  predicted_side: 'YES' | 'NO';
  actual_outcome?: 'YES' | 'NO';
  result?: 'WIN' | 'LOSS';
  expiry_time: number;
  checked_time?: number;
  asset: string;
}

const outcomesPath = path.join(__dirname, '../../logs', 'market-outcomes.json');

function loadOutcomes(): MarketOutcome[] {
  try {
    if (fs.existsSync(outcomesPath)) {
      const data = fs.readFileSync(outcomesPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading outcomes:', (e as Error).message);
  }
  return [];
}

function saveOutcomes(outcomes: MarketOutcome[]): void {
  try {
    const dir = path.dirname(outcomesPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outcomesPath, JSON.stringify(outcomes, null, 2));
    console.log('✅ Outcomes saved');
  } catch (e) {
    console.error('Error saving outcomes:', (e as Error).message);
  }
}

function logOutcome(
  marketId: string,
  actualOutcome: 'YES' | 'NO'
): void {
  const outcomes = loadOutcomes();
  const market = outcomes.find((o) => o.market_id === marketId);

  if (!market) {
    console.error(`❌ Market ${marketId} not found in tracked opportunities`);
    return;
  }

  // Determine if it was a win or loss
  const predicted = market.predicted_side;
  const result = predicted === actualOutcome ? 'WIN' : 'LOSS';

  market.actual_outcome = actualOutcome;
  market.result = result;
  market.checked_time = Date.now();

  saveOutcomes(outcomes);

  const badge = result === 'WIN' ? '✅' : '❌';
  const probPct = (market.predicted_probability * 100).toFixed(1);
  console.log(
    `${badge} Market ${marketId}: Predicted ${market.predicted_side} @ ${probPct}% → Actual ${actualOutcome} = ${result}`
  );
}

// Get all unresolved markets for reference
function showUnresolved(): void {
  const outcomes = loadOutcomes();
  const unresolved = outcomes.filter((o) => o.result === undefined);

  if (unresolved.length === 0) {
    console.log('✅ No unresolved markets');
    return;
  }

  console.log(`\n📋 UNRESOLVED MARKETS (${unresolved.length}):\n`);
  unresolved.forEach((m) => {
    const probPct = (m.predicted_probability * 100).toFixed(1);
    const remaining = Math.max(0, Math.floor((m.expiry_time - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;

    console.log(
      `  ${m.market_id} | ${m.asset} | ${m.predicted_side} @ ${probPct}% | Expires in: ${mins}m ${secs}s`
    );
  });
  console.log('');
}

// Parse command line args
const args = process.argv.slice(2);

if (args[0] === '--show' || args[0] === '-s') {
  showUnresolved();
} else if (args[0] && args[1]) {
  const marketId = args[0];
  const outcome = args[1].toUpperCase() as 'YES' | 'NO';
  if (outcome !== 'YES' && outcome !== 'NO') {
    console.error('❌ Outcome must be YES or NO');
    process.exit(1);
  }
  logOutcome(marketId, outcome);
} else {
  console.log(`Usage:
  node --loader ts-node/esm packages/core/src/log-outcome.ts <market_id> <YES|NO>
    Log an outcome for a specific market

  node --loader ts-node/esm packages/core/src/log-outcome.ts --show
    Show all unresolved markets

Example:
  node --loader ts-node/esm packages/core/src/log-outcome.ts 90370 YES
  node --loader ts-node/esm packages/core/src/log-outcome.ts 90367 NO`);
}
