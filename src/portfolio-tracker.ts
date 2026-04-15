// Portfolio Tracker — Monitors simulated weather bets and reports P&L
// Checks market prices in real-time and resolves against actuals after expiry

import { config as dotenvConfig } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import PolymarketWeatherScanner from './services/polymarket-weather-scanner.js';
import { WEATHER_LOCATIONS, fahrenheitToCelsius } from './services/noaa-weather-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig();

interface Position {
  location: string;
  targetDate: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;    // 0-1
  forecastProb: number;  // 0-1
  size: number;          // dollars
  temperatureC: number;
  confidence: string;
  // Tracking fields
  currentPrice?: number;
  unrealizedPnL?: number;
  resolved?: boolean;
  resolvedYes?: boolean;
  actualTempC?: number;
  finalPnL?: number;
}

const portfolioPath = path.join(__dirname, '../logs/simulated-portfolio.json');
const resultsPath = path.join(__dirname, '../logs/portfolio-results.json');

async function loadPortfolio(): Promise<Position[]> {
  const raw = fs.readFileSync(portfolioPath, 'utf-8');
  return JSON.parse(raw);
}

async function fetchActualTemp(location: string, date: string): Promise<number | null> {
  const loc = WEATHER_LOCATIONS.find(l => l.name === location);
  if (!loc) return null;

  try {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat}&longitude=${loc.lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max&temperature_unit=celsius&timezone=auto`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    return data.daily?.temperature_2m_max?.[0] ?? null;
  } catch {
    return null;
  }
}

function didOutcomeWin(outcome: string, actualC: number, tempC: number): boolean {
  if (outcome.includes('or below')) return actualC <= tempC;
  if (outcome.includes('or higher')) return actualC >= tempC;
  return Math.round(actualC) === tempC;
}

async function trackPortfolio(): Promise<void> {
  const portfolio = await loadPortfolio();
  const scanner = new PolymarketWeatherScanner();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║              SIMULATED PORTFOLIO TRACKER                             ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Try to get current market prices
  let markets: any[] = [];
  try {
    markets = await scanner.scanWeatherMarkets();
  } catch {}

  let totalDeployed = 0;
  let totalUnrealized = 0;
  let totalResolved = 0;
  let totalResolvedPnL = 0;
  let wins = 0;
  let losses = 0;

  console.log(`${'#'.padStart(2)}  Side  ${'City'.padEnd(12)}  ${'Outcome'.padEnd(16)}  ${'Entry'.padStart(6)}  ${'Now'.padStart(6)}  ${'Size'.padStart(6)}  ${'P&L'.padStart(8)}  Status`);
  console.log('-'.repeat(90));

  for (let i = 0; i < portfolio.length; i++) {
    const pos = portfolio[i];
    totalDeployed += pos.size;

    // Check if market has resolved (target date has passed)
    const isExpired = pos.targetDate < todayStr;

    if (isExpired && !pos.resolved) {
      // Try to fetch actual temperature
      const actualC = await fetchActualTemp(pos.location, pos.targetDate);
      if (actualC !== null) {
        pos.actualTempC = actualC;
        pos.resolvedYes = didOutcomeWin(pos.outcome, actualC, pos.temperatureC);
        pos.resolved = true;

        if (pos.side === 'BUY') {
          pos.finalPnL = pos.resolvedYes
            ? pos.size * (1 - pos.entryPrice)   // Won: profit = size * (1 - cost)
            : -pos.size * pos.entryPrice;         // Lost: lose cost
        } else {
          pos.finalPnL = !pos.resolvedYes
            ? pos.size * pos.entryPrice            // NO won: profit = size * market price
            : -pos.size * (1 - pos.entryPrice);    // NO lost: lose (1 - market price)
        }
      }
    }

    // Try to get live price
    if (!pos.resolved) {
      const market = markets.find(m =>
        m.location === pos.location && m.targetDate === pos.targetDate
      );
      if (market) {
        const outcomeMatch = market.outcomes.find((o: any) => o.label === pos.outcome);
        if (outcomeMatch) {
          pos.currentPrice = outcomeMatch.yesPrice;

          if (pos.side === 'BUY') {
            // Unrealized P&L on YES position: (currentPrice - entryPrice) * size
            pos.unrealizedPnL = (pos.currentPrice - pos.entryPrice) * pos.size;
          } else {
            // Unrealized P&L on NO position: (entryPrice - currentPrice) * size
            pos.unrealizedPnL = (pos.entryPrice - pos.currentPrice) * pos.size;
          }
        }
      }
    }

    // Display
    const entry = (pos.entryPrice * 100).toFixed(1) + '%';
    let current: string;
    let pnl: string;
    let status: string;

    if (pos.resolved) {
      current = pos.resolvedYes ? ' YES' : '  NO';
      pnl = `$${pos.finalPnL! >= 0 ? '+' : ''}${pos.finalPnL!.toFixed(0)}`;
      status = pos.finalPnL! >= 0 ? '✅ WIN' : '❌ LOSS';
      totalResolved++;
      totalResolvedPnL += pos.finalPnL!;
      if (pos.finalPnL! >= 0) wins++; else losses++;
    } else if (pos.currentPrice !== undefined) {
      current = (pos.currentPrice * 100).toFixed(1) + '%';
      pnl = `$${pos.unrealizedPnL! >= 0 ? '+' : ''}${pos.unrealizedPnL!.toFixed(0)}`;
      status = pos.unrealizedPnL! >= 0 ? '📈 OPEN' : '📉 OPEN';
      totalUnrealized += pos.unrealizedPnL!;
    } else {
      current = '  -  ';
      pnl = '     -';
      status = '⏳ PENDING';
    }

    console.log(
      `${(i + 1).toString().padStart(2)}  ${pos.side.padEnd(4)}  ${pos.location.padEnd(12)}  ${pos.outcome.padEnd(16)}  ${entry.padStart(6)}  ${current.padStart(6)}  $${pos.size.toString().padStart(5)}  ${pnl.padStart(8)}  ${status}`
    );
  }

  console.log('-'.repeat(90));
  console.log('');
  console.log(`DEPLOYED:     $${totalDeployed.toLocaleString()}`);

  if (totalResolved > 0) {
    console.log(`RESOLVED:     ${totalResolved}/${portfolio.length} (${wins}W ${losses}L)`);
    console.log(`REALIZED P&L: $${totalResolvedPnL >= 0 ? '+' : ''}${totalResolvedPnL.toFixed(0)}`);
  }

  const openCount = portfolio.length - totalResolved;
  if (openCount > 0 && totalUnrealized !== 0) {
    console.log(`OPEN:         ${openCount} positions`);
    console.log(`UNREALIZED:   $${totalUnrealized >= 0 ? '+' : ''}${totalUnrealized.toFixed(0)}`);
  }

  const totalPnL = totalResolvedPnL + totalUnrealized;
  console.log(`TOTAL P&L:    $${totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(0)} (${(totalPnL / totalDeployed * 100).toFixed(1)}%)`);
  console.log('');

  // Save results
  fs.writeFileSync(resultsPath, JSON.stringify(portfolio, null, 2));

  // Schedule next check
  const targetDates = [...new Set(portfolio.map(p => p.targetDate))];
  const allResolved = portfolio.every(p => p.resolved);

  if (allResolved) {
    console.log('All positions resolved! Final results saved to logs/portfolio-results.json');
    console.log('');
    console.log('Generating new positions from today\'s edges...');
    await generateNewPositions();
  }

  // Always keep running — check every 5 min
  console.log(`Markets resolve on: ${targetDates.join(', ')}`);
  console.log('Checking again in 5 minutes...');
  console.log('');
  setTimeout(() => trackPortfolio(), 5 * 60 * 1000);
}

// Auto-generate new simulated positions from the arbitrage bot's live edges
async function generateNewPositions(): Promise<void> {
  try {
    // Fetch current edges from dashboard API
    const resp = await fetch('http://localhost:3334/api/weather/edges');
    if (!resp.ok) return;
    const edges = (await resp.json()) as any[];

    if (edges.length === 0) {
      console.log('      No edges available for new positions');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Load existing portfolio to avoid duplicates
    let portfolio: Position[] = [];
    try { portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf-8')); } catch {}

    const existingKeys = new Set(portfolio.map(p => `${p.location}:${p.targetDate}:${p.outcome}`));

    // Pick top edges by expected profit, cap at $5000 total new deployment
    const sorted = edges
      .filter((e: any) => !existingKeys.has(`${e.location}:${e.targetDate}:${e.outcome}`))
      .sort((a: any, b: any) => b.expectedProfit - a.expectedProfit);

    let deployed = 0;
    const maxDeploy = 5000;
    let added = 0;

    for (const e of sorted) {
      if (deployed >= maxDeploy) break;
      if (added >= 15) break; // Max 15 positions per day

      const size = Math.min(e.size || 100, maxDeploy - deployed);
      if (size < 10) continue;

      portfolio.push({
        location: e.location,
        targetDate: e.targetDate,
        outcome: e.outcome,
        side: e.side === 'BUY' ? 'BUY' : 'SELL',
        entryPrice: e.marketPrice / 100,
        forecastProb: e.forecastProb / 100,
        size,
        temperatureC: e.temperatureC || 0,
        confidence: e.confidence || 'LOW',
      });

      deployed += size;
      added++;
    }

    if (added > 0) {
      fs.writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2));
      console.log(`      Added ${added} new positions ($${deployed.toFixed(0)} deployed) for ${todayStr}`);
    }
  } catch (e) {
    console.error(`[Portfolio] Auto-generate failed: ${(e as Error).message}`);
  }
}

trackPortfolio().catch(console.error);
