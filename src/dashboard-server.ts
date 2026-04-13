// Sneakers Trading Terminal — Dashboard Server
// Serves the terminal UI + WebSocket real-time updates + REST API backed by SQLite

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { config as dotenvConfig } from 'dotenv';
import { db, insertSnapshotBatch, upsertOutcomeBatch } from './db.js';

dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3333;
const logsDir = path.join(__dirname, '../logs');
const limitlessUrl = 'https://api.limitless.exchange';
const limitlessKey = process.env.LIMITLESS_API_KEY;
const cdcEventUrl = 'https://web.crypto.com/api/proxy/private/knock-out/predictions/api/v1/event-durations';
const cdcContractsUrl = 'https://web.crypto.com/api/proxy/public/knock-out/predictions/public/api/v2/contracts';

app.use(express.json());

// ─── API Endpoints ───────────────────────────────────────────────────────────

// Live markets from all platforms
app.get('/api/markets', async (_req, res) => {
  try {
    const markets = await fetchAllMarkets();
    res.json(markets);
  } catch { res.json([]); }
});

// Calibration stats from SQLite
app.get('/api/calibration', (_req, res) => {
  try {
    const bands = db.prepare(`
      SELECT
        CASE
          WHEN probability >= 0.99 THEN '99-100%'
          WHEN probability >= 0.98 THEN '98-99%'
          WHEN probability >= 0.97 THEN '97-98%'
          WHEN probability >= 0.96 THEN '96-97%'
          ELSE '95-96%'
        END as band,
        COUNT(*) as total,
        SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END) as losses
      FROM market_outcomes
      WHERE probability >= 0.95
      GROUP BY band
      ORDER BY band DESC
    `).all();
    res.json(bands);
  } catch { res.json([]); }
});

// Wallet / portfolio stats — overall + per-platform
app.get('/api/wallet', (_req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Load trades from both platforms
    const limitlessLogPath = path.join(logsDir, `trades-${today}.json`);
    const cdcLogPath = path.join(logsDir, `crypto-com-trades-${today}.json`);
    let limitlessTrades: any[] = [];
    let cdcTrades: any[] = [];
    if (fs.existsSync(limitlessLogPath)) limitlessTrades = JSON.parse(fs.readFileSync(limitlessLogPath, 'utf-8'));
    if (fs.existsSync(cdcLogPath)) cdcTrades = JSON.parse(fs.readFileSync(cdcLogPath, 'utf-8'));

    const allTrades = [...limitlessTrades, ...cdcTrades];
    const successful = allTrades.filter((t: any) => t.status === 'SUCCESS');
    const deployed = successful.reduce((s: number, t: any) => s + (t.position_size || 0), 0);
    const profit = successful.reduce((s: number, t: any) => s + (t.estimated_return || 0), 0);

    const stats = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
             SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as resolved
      FROM market_outcomes WHERE probability >= 0.95
    `).get() as any;

    // Per-platform breakdown
    function platformStats(platform: string, trades: any[], capitalAlloc: number) {
      const succ = trades.filter((t: any) => t.status === 'SUCCESS');
      const dep = succ.reduce((s: number, t: any) => s + (t.position_size || 0), 0);
      const pnl = succ.reduce((s: number, t: any) => s + (t.estimated_return || 0), 0);
      const ps = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as resolved
        FROM market_outcomes WHERE probability >= 0.95 AND platform = @platform
      `).get({ platform }) as any;
      const wr = ps?.resolved > 0 ? ((ps.wins / ps.resolved) * 100) : 0;
      return {
        platform,
        configured: platform === 'Limitless' ? !!limitlessKey : false,
        capital: capitalAlloc,
        idle: capitalAlloc - dep,
        invested: dep,
        yield: pnl,
        yieldPct: dep > 0 ? ((pnl / dep) * 100) : 0,
        trades: succ.length,
        tracked: ps?.total || 0,
        resolved: ps?.resolved || 0,
        wins: ps?.wins || 0,
        winRate: wr,
      };
    }

    res.json({
      capital: 5000,
      deployed,
      available: 5000 - deployed,
      profitPotential: profit,
      tradesToday: successful.length,
      targetDaily: 15,
      allTimeTracked: stats?.total || 0,
      allTimeResolved: stats?.resolved || 0,
      allTimeWins: stats?.wins || 0,
      winRate: stats?.resolved > 0 ? ((stats.wins / stats.resolved) * 100).toFixed(1) : '0',
      platforms: [
        platformStats('Limitless', limitlessTrades, 3000),
        platformStats('Crypto.com', cdcTrades, 2000),
      ],
    });
  } catch { res.json({ capital: 5000, deployed: 0, available: 5000, profitPotential: 0, tradesToday: 0, targetDaily: 15, allTimeTracked: 0, allTimeResolved: 0, allTimeWins: 0, winRate: '0', platforms: [] }); }
});

// Recent snapshots for a specific market
app.get('/api/market/:id/history', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT probability, seconds_to_expiry, observed_at
      FROM market_snapshots
      WHERE market_id = @id
      ORDER BY observed_at DESC LIMIT 100
    `).all({ id: req.params.id });
    res.json(rows);
  } catch { res.json([]); }
});

// Correlation data
app.get('/api/correlations', (_req, res) => {
  try {
    const hourly = db.prepare(`
      SELECT
        CAST((expiry_time / 3600000) % 24 AS INTEGER) AS hour,
        COUNT(*) AS total,
        SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) AS resolved
      FROM market_outcomes WHERE probability >= 0.95
      GROUP BY hour ORDER BY hour
    `).all();
    res.json({ hourly });
  } catch { res.json({ hourly: [] }); }
});

// Platform configs — read keys (masked) and connection status
app.get('/api/platforms', async (_req, res) => {
  const envPath = path.join(__dirname, '../.env');
  let envContent = '';
  try { envContent = fs.readFileSync(envPath, 'utf-8'); } catch {}

  function getEnv(key: string) {
    const m = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  }
  function mask(val: string) {
    if (!val) return '';
    if (val.length <= 6) return '****';
    return val.substring(0, 3) + '****' + val.substring(val.length - 3);
  }

  // Test connections
  async function testLimitless(): Promise<boolean> {
    try {
      const k = getEnv('LIMITLESS_API_KEY');
      if (!k) return false;
      const r = await fetch(`${limitlessUrl}/markets/active`, {
        headers: { 'X-API-Key': k, 'Content-Type': 'application/json' },
      });
      return r.ok;
    } catch { return false; }
  }
  async function testCryptoCom(): Promise<boolean> {
    try {
      const r = await fetch(`${cdcEventUrl}?event_kind=BTC`, {
        headers: { 'Content-Type': 'application/json' },
      });
      return r.ok;
    } catch { return false; }
  }
  async function testKalshi(): Promise<boolean> {
    try {
      const k = getEnv('KALSHI_API_KEY');
      if (!k) return false;
      const r = await fetch('https://trading-api.kalshi.com/trade-api/v2/exchange/status', {
        headers: { 'Authorization': `Bearer ${k}` },
      });
      return r.ok;
    } catch { return false; }
  }
  async function testPolymarket(): Promise<boolean> {
    try {
      const k = getEnv('POLYMARKET_API_KEY');
      if (!k) return false;
      return true; // Key exists = configured
    } catch { return false; }
  }

  const [limitlessOk, cdcOk, kalshiOk, polyOk] = await Promise.all([
    testLimitless(), testCryptoCom(), testKalshi(), testPolymarket(),
  ]);

  const hasKey = (k: string) => !!getEnv(k);

  // canSeeData = can we pull market data from this platform?
  // canTrade   = can we place orders on this platform?
  function plat(name: string, keys: any[], canSeeData: boolean, canTrade: boolean, autoExec = false) {
    return { name, keys, canSeeData, canTrade, autoExecute: autoExec };
  }
  function k(label: string, envKey: string) {
    return { label, envKey, masked: mask(getEnv(envKey)), hasValue: hasKey(envKey) };
  }

  res.json([
    plat('Limitless', [k('API Key','LIMITLESS_API_KEY'), k('API Secret','LIMITLESS_API_SECRET')],
      limitlessOk, limitlessOk && hasKey('LIMITLESS_API_SECRET'), getEnv('AUTO_EXECUTE')==='true'),
    plat('Crypto.com', [k('API Key','CRYPTO_COM_API_KEY'), k('API Secret','CRYPTO_COM_API_SECRET')],
      cdcOk, hasKey('CRYPTO_COM_API_KEY') && hasKey('CRYPTO_COM_API_SECRET'), getEnv('CDC_AUTO_EXECUTE')==='true'),
    plat('Kalshi', [k('API Key','KALSHI_API_KEY')],
      kalshiOk, kalshiOk, false),
    plat('Polymarket', [k('API Key','POLYMARKET_API_KEY'), k('Private Key','POLYMARKET_PRIVATE_KEY')],
      polyOk, hasKey('POLYMARKET_PRIVATE_KEY'), false),
    plat('Coinbase', [k('API Key','COINBASE_API_KEY'), k('API Secret','COINBASE_API_SECRET')],
      hasKey('COINBASE_API_KEY'), hasKey('COINBASE_API_KEY') && hasKey('COINBASE_API_SECRET'), false),
    plat('Robinhood', [k('Username','ROBINHOOD_USER'), k('Password','ROBINHOOD_PASS'), k('MFA Secret','ROBINHOOD_MFA')],
      hasKey('ROBINHOOD_USER'), hasKey('ROBINHOOD_USER') && hasKey('ROBINHOOD_PASS'), false),
    plat('DraftKings', [k('API Key','DRAFTKINGS_API_KEY'), k('API Secret','DRAFTKINGS_API_SECRET')],
      hasKey('DRAFTKINGS_API_KEY'), hasKey('DRAFTKINGS_API_KEY') && hasKey('DRAFTKINGS_API_SECRET'), false),
    plat('FanDuel', [k('API Key','FANDUEL_API_KEY'), k('API Secret','FANDUEL_API_SECRET')],
      hasKey('FANDUEL_API_KEY'), hasKey('FANDUEL_API_KEY') && hasKey('FANDUEL_API_SECRET'), false),
    plat('Bet365', [k('API Key','BET365_API_KEY'), k('Token','BET365_TOKEN')],
      hasKey('BET365_API_KEY'), hasKey('BET365_API_KEY') && hasKey('BET365_TOKEN'), false),
    plat('NoVig', [k('API Key','NOVIG_API_KEY')],
      hasKey('NOVIG_API_KEY'), hasKey('NOVIG_API_KEY'), false),
    plat('Betr', [k('API Key','BETR_API_KEY'), k('API Secret','BETR_API_SECRET')],
      hasKey('BETR_API_KEY'), hasKey('BETR_API_KEY') && hasKey('BETR_API_SECRET'), false),
    plat('Underdog', [k('API Key','UNDERDOG_API_KEY')],
      hasKey('UNDERDOG_API_KEY'), hasKey('UNDERDOG_API_KEY'), false),
    plat('PredictIt', [k('Username','PREDICTIT_USER'), k('Password','PREDICTIT_PASS')],
      false, false, false),
    plat('Metaculus', [k('API Key','METACULUS_API_KEY')],
      false, false, false),
    plat('Manifold', [k('API Key','MANIFOLD_API_KEY')],
      false, false, false),
  ]);
});

// Save a platform key
app.post('/api/platforms/key', (req, res) => {
  const { envKey, value } = req.body;
  if (!envKey || typeof value !== 'string') return res.status(400).json({ error: 'Missing envKey or value' });

  // Validate the key name is one we expect
  const allowedKeys = [
    'LIMITLESS_API_KEY', 'LIMITLESS_API_SECRET',
    'CRYPTO_COM_API_KEY', 'CRYPTO_COM_API_SECRET',
    'KALSHI_API_KEY',
    'POLYMARKET_API_KEY', 'POLYMARKET_PRIVATE_KEY',
    'COINBASE_API_KEY', 'COINBASE_API_SECRET',
    'ROBINHOOD_USER', 'ROBINHOOD_PASS', 'ROBINHOOD_MFA',
    'DRAFTKINGS_API_KEY', 'DRAFTKINGS_API_SECRET',
    'FANDUEL_API_KEY', 'FANDUEL_API_SECRET',
    'BET365_API_KEY', 'BET365_TOKEN',
    'NOVIG_API_KEY',
    'BETR_API_KEY', 'BETR_API_SECRET',
    'UNDERDOG_API_KEY',
    'PREDICTIT_USER', 'PREDICTIT_PASS',
    'METACULUS_API_KEY', 'MANIFOLD_API_KEY',
    'AUTO_EXECUTE', 'CDC_AUTO_EXECUTE',
  ];
  if (!allowedKeys.includes(envKey)) return res.status(400).json({ error: 'Invalid key name' });

  const envPath = path.join(__dirname, '../.env');
  let content = '';
  try { content = fs.readFileSync(envPath, 'utf-8'); } catch {}

  const regex = new RegExp(`^${envKey}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${envKey}=${value}`);
  } else {
    content = content.trimEnd() + `\n${envKey}=${value}\n`;
  }

  fs.writeFileSync(envPath, content);
  // Reload into process.env
  process.env[envKey] = value;
  res.json({ ok: true });
});

// Agent status
app.get('/api/agent', (_req, res) => {
  const snapCount = (db.prepare('SELECT COUNT(*) as c FROM market_snapshots').get() as any)?.c || 0;
  const outCount = (db.prepare('SELECT COUNT(*) as c FROM market_outcomes').get() as any)?.c || 0;
  res.json({
    status: 'running',
    snapshots: snapCount,
    outcomes: outCount,
    uptime: process.uptime(),
    scanning: ['Limitless', 'Crypto.com'],
  });
});

// ─── Market Fetching ─────────────────────────────────────────────────────────

interface LiveMarket {
  id: string;
  platform: string;
  asset: string;
  title: string;
  logo: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
  secondsToExpiry: number;
  tags: string[];
  category: string;
  confidence: string;
  urgency: string;
}

async function fetchAllMarkets(): Promise<LiveMarket[]> {
  const [limitless, cryptoCom] = await Promise.all([
    fetchLimitlessMarkets(),
    fetchCryptoComMarkets(),
  ]);
  return [...limitless, ...cryptoCom].sort((a, b) => a.secondsToExpiry - b.secondsToExpiry);
}

async function fetchLimitlessMarkets(): Promise<LiveMarket[]> {
  try {
    const r = await fetch(`${limitlessUrl}/markets/active`, {
      headers: { 'X-API-Key': limitlessKey, 'Content-Type': 'application/json' },
    });
    if (!r.ok) return [];
    const data = (await r.json()) as any;
    const now = Date.now();
    const snapshots: any[] = [];

    const markets = (data.data || []).map((m: any) => {
      const title = m.title || '';
      const yesPrice = m.prices?.[0] || 0;
      const noPrice = m.prices?.[1] || 0;
      const titleLower = title.toLowerCase();

      let asset = 'OTHER';
      if (titleLower.includes('btc')) asset = 'BTC';
      else if (titleLower.includes('eth')) asset = 'ETH';
      else if (titleLower.includes('sol')) asset = 'SOL';
      else if (titleLower.includes('xrp')) asset = 'XRP';
      else if (titleLower.includes('doge')) asset = 'DOGE';

      const expiryMatch = title.match(/(\w+)\s+(\d+),\s+(\d+):(\d+)\s*(AM|PM|UTC)?/);
      let secondsToExpiry = 9999;
      let expiryTime = now + 9999000;
      if (expiryMatch) {
        const [, month, day, hour, min] = expiryMatch;
        const d = new Date(`2026-${month} ${day} ${hour}:${min}:00 UTC`);
        secondsToExpiry = Math.max(0, (d.getTime() - now) / 1000);
        expiryTime = d.getTime();
      }

      let category = 'crypto';
      if (m.tags?.some((t: string) => /sport|nba|nfl|mlb|soccer/i.test(t))) category = 'sports';
      else if (m.tags?.some((t: string) => /politic|election/i.test(t))) category = 'politics';
      else if (secondsToExpiry < 600) category = 'quick';

      const maxProb = Math.max(yesPrice, noPrice);
      let confidence = '';
      if (maxProb >= 0.99) confidence = 'LOCK';
      else if (maxProb >= 0.98) confidence = 'HAMMER';
      else if (maxProb >= 0.97) confidence = 'GOOD';
      else if (maxProb >= 0.95) confidence = 'WATCH';

      let urgency = '';
      if (secondsToExpiry < 120) urgency = 'CRITICAL';
      else if (secondsToExpiry < 300) urgency = 'HIGH';
      else if (secondsToExpiry < 600) urgency = 'NORMAL';

      // Collect snapshot for DB
      if (maxProb >= 0.95 && secondsToExpiry < 3600) {
        const side = yesPrice >= noPrice ? 'YES' : 'NO';
        snapshots.push({
          market_id: String(m.id), platform: 'Limitless', category, asset,
          title: title.substring(0, 80), yes_price: yesPrice, no_price: noPrice,
          probability: maxProb, side,
          volume: parseFloat(m.volume || '0'), liquidity: 0, spread: 0,
          seconds_to_expiry: secondsToExpiry, expiry_time: expiryTime, observed_at: now,
        });
      }

      return {
        id: String(m.id),
        platform: 'Limitless',
        asset,
        title: title.substring(0, 60),
        logo: m.logo || '',
        yesPrice,
        noPrice,
        volume: m.volume || '0',
        secondsToExpiry,
        tags: m.tags || [],
        category,
        confidence,
        urgency,
      };
    });

    // Write snapshots to DB
    if (snapshots.length > 0) {
      try {
        insertSnapshotBatch(snapshots);
        upsertOutcomeBatch(snapshots);
      } catch { /* non-critical */ }
    }

    return markets;
  } catch { return []; }
}

async function fetchCryptoComMarkets(): Promise<LiveMarket[]> {
  try {
    const assets = ['BTC', 'ETH', 'LTC', 'DOGE', 'AVAX', 'LINK'];
    const eventIds: string[] = [];
    for (const asset of assets) {
      try {
        const r = await fetch(`${cdcEventUrl}?event_kind=${asset}`, { headers: { 'Content-Type': 'application/json' } });
        if (r.ok) {
          const d = (await r.json()) as any;
          (d.data || []).forEach((e: any) => { if (e.event_id) eventIds.push(e.event_id); });
        }
      } catch { continue; }
    }
    if (eventIds.length === 0) return [];

    const r = await fetch(`${cdcContractsUrl}?event_id=${eventIds.join(',')}`, { headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) return [];
    const data = (await r.json()) as any;
    const items = Array.isArray(data.data || data.contracts || data) ? (data.data || data.contracts || data) : [];
    const now = Date.now();

    return items.map((c: any) => {
      const title = c.label || c.title || c.name || '';
      const assetMatch = title.match(/BTC|ETH|LTC|DOGE|AVAX|LINK/);
      const asset = assetMatch ? assetMatch[0] : 'OTHER';
      const expiryTime = c.settlement_time || c.expiry_time || c.end_time;
      const secondsToExpiry = expiryTime ? Math.max(0, (new Date(expiryTime).getTime() - now) / 1000) : 9999;

      let yesProb = c.yes_price || c.yes_probability || 0;
      let noProb = c.no_price || c.no_probability || 0;
      if (yesProb > 1) yesProb /= 100;
      if (noProb > 1) noProb /= 100;

      const maxProb = Math.max(yesProb, noProb);
      let confidence = '';
      if (maxProb >= 0.99) confidence = 'LOCK';
      else if (maxProb >= 0.98) confidence = 'HAMMER';
      else if (maxProb >= 0.97) confidence = 'GOOD';
      else if (maxProb >= 0.95) confidence = 'WATCH';

      let urgency = '';
      if (secondsToExpiry < 120) urgency = 'CRITICAL';
      else if (secondsToExpiry < 300) urgency = 'HIGH';
      else if (secondsToExpiry < 600) urgency = 'NORMAL';

      return {
        id: c.id?.toString() || `cdc-${asset}`,
        platform: 'Crypto.com',
        asset,
        title: title.substring(0, 60),
        logo: '',
        yesPrice: yesProb,
        noPrice: noProb,
        volume: c.volume || '0',
        secondsToExpiry,
        tags: [],
        category: secondsToExpiry < 600 ? 'quick' : 'crypto',
        confidence,
        urgency,
      };
    }).filter((m: LiveMarket) => m.secondsToExpiry > 0 && m.secondsToExpiry < 7200);
  } catch { return []; }
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

function broadcast(type: string, data: any) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

// Push live market data every 10s
setInterval(async () => {
  try {
    const markets = await fetchAllMarkets();
    broadcast('MARKETS', markets);
  } catch { /* continue */ }
}, 10000);

// ─── Serve Terminal UI ───────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.send(TERMINAL_HTML);
});

server.listen(PORT, () => {
  console.log(`\n  Sneakers Trading Terminal running at http://localhost:${PORT}\n`);
});

// ─── Terminal HTML ───────────────────────────────────────────────────────────

const TERMINAL_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>&#128094; Sneakers Trading Terminal</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#128094;</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  /* ─── Dark theme (default) ─── */
  :root, [data-theme="dark"] {
    --bg: #0b0e11;
    --bg2: #0f1318;
    --bg3: #161b22;
    --bg-card: #1c2128;
    --border: rgba(255,255,255,0.06);
    --border-hover: rgba(255,255,255,0.12);
    --text: #e6edf3;
    --text-secondary: #b1bac4;
    --dim: #656d76;
    --green: #3fb950;
    --green-soft: rgba(63,185,80,0.12);
    --red: #f85149;
    --red-soft: rgba(248,81,73,0.12);
    --yellow: #d29922;
    --yellow-soft: rgba(210,153,34,0.12);
    --blue: #58a6ff;
    --blue-soft: rgba(88,166,255,0.1);
    --purple: #bc8cff;
    --cyan: #79c0ff;
    --radius: 8px;
    --radius-sm: 6px;

    /* Platform brand colors */
    --plat-kalshi: #00d26a;
    --plat-polymarket: #3b82f6;
    --plat-limitless: #a78bfa;
    --plat-crypto: #0ea5e9;
    --plat-predictit: #f97316;
    --plat-metaculus: #eab308;
    --plat-manifold: #ec4899;
    --plat-coinbase: #0052ff;
    --plat-robinhood: #00c805;
    --plat-draftkings: #53d337;
    --plat-fanduel: #1493ff;
    --plat-bet365: #027b5b;
    --plat-novig: #ff6b35;
    --plat-betr: #ff2d55;
    --plat-underdog: #ffcc00;
    --plat-default: #8b949e;
  }

  /* ─── Light theme ─── */
  [data-theme="light"] {
    --bg: #f6f8fa;
    --bg2: #ffffff;
    --bg3: #f0f2f5;
    --bg-card: #ffffff;
    --border: rgba(0,0,0,0.08);
    --border-hover: rgba(0,0,0,0.14);
    --text: #1f2328;
    --text-secondary: #59636e;
    --dim: #8b949e;
    --green: #1a7f37;
    --green-soft: rgba(26,127,55,0.1);
    --red: #cf222e;
    --red-soft: rgba(207,34,46,0.1);
    --yellow: #9a6700;
    --yellow-soft: rgba(154,103,0,0.1);
    --blue: #0969da;
    --blue-soft: rgba(9,105,218,0.08);
    --purple: #8250df;
    --cyan: #0550ae;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    overflow: hidden;
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background 0.3s ease, color 0.3s ease;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    height: 52px;
    transition: background 0.3s ease;
  }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .logo {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.3px;
  }
  .logo span { color: var(--dim); font-weight: 400; font-size: 12px; margin-left: 6px; }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 8px rgba(63,185,80,0.4);
    animation: pulse 2.5s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .header-right { display: flex; align-items: center; gap: 20px; font-size: 12px; color: var(--dim); font-weight: 400; }
  .header-right .val { color: var(--text-secondary); font-weight: 500; }

  /* Theme toggle */
  .theme-toggle {
    display: flex;
    align-items: center;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 2px;
    gap: 0;
    cursor: pointer;
  }
  .theme-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px; height: 26px;
    border-radius: 14px;
    border: none;
    background: transparent;
    color: var(--dim);
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }
  .theme-btn.active {
    background: var(--blue);
    color: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  }

  /* Layout */
  .main { display: flex; height: calc(100vh - 52px); }

  /* Left Panel */
  .panel-left {
    width: 300px;
    min-width: 300px;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    background: var(--bg2);
    transition: background 0.3s ease;
  }

  /* Left panel toggle buttons */
  .left-toggle {
    display: flex;
    padding: 10px 12px;
    gap: 6px;
    border-bottom: 1px solid var(--border);
  }
  .left-toggle-btn {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: transparent;
    color: var(--dim);
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .left-toggle-btn:hover { background: var(--bg3); color: var(--text-secondary); }
  .left-toggle-btn.active {
    background: var(--blue-soft);
    color: var(--blue);
    border-color: var(--blue);
    font-weight: 600;
  }
  .left-toggle-btn .icon { font-size: 14px; }

  .panel-title {
    padding: 10px 16px 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--dim);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .panel-title .count { color: var(--blue); font-weight: 600; font-size: 11px; }

  .left-content {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .left-content::-webkit-scrollbar { width: 6px; }
  .left-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

  /* ─── Sites view ─── */
  .site-card {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s ease;
  }
  .site-card:hover { background: var(--bg3); }
  .site-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }
  .site-name {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .site-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .site-lights {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .site-light {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--dim);
  }
  .site-light .bulb {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--dim);
    opacity: 0.3;
    transition: all 0.3s ease;
  }
  .site-light .bulb.on {
    opacity: 1;
    box-shadow: 0 0 6px currentColor;
  }
  .site-light .bulb.data-on { background: var(--green); color: var(--green); }
  .site-light .bulb.trade-on { background: var(--blue); color: var(--blue); }
  .site-expand {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease;
  }
  .site-expand.open { max-height: 500px; }
  .site-detail {
    padding-top: 10px;
  }
  .site-meta {
    font-size: 11px;
    color: var(--dim);
    margin-bottom: 8px;
    line-height: 1.5;
  }
  .site-key-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .site-key-label {
    font-size: 10px;
    font-weight: 500;
    color: var(--dim);
    width: 70px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .site-key-input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    color: var(--text);
    outline: none;
    transition: border-color 0.2s ease;
  }
  .site-key-input:focus { border-color: var(--blue); }
  .site-key-input::placeholder { color: var(--dim); }
  .site-key-input.has-value { color: var(--green); }
  .site-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .site-btn {
    flex: 1;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-secondary);
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
  }
  .site-btn:hover { background: var(--bg3); border-color: var(--border-hover); }
  .site-btn.primary { background: var(--blue-soft); color: var(--blue); border-color: var(--blue); }
  .site-btn.primary:hover { background: var(--blue); color: #fff; }
  .site-btn.save { background: var(--green-soft); color: var(--green); border-color: transparent; }
  .site-btn.save:hover { background: var(--green); color: #fff; }
  .site-conn-info {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 6px 8px;
    background: var(--bg);
    border-radius: var(--radius-sm);
    font-size: 10px;
    border: 1px solid var(--border);
  }
  .site-conn-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .site-balances {
    display: flex;
    gap: 4px;
    margin-top: 8px;
  }
  .site-bal {
    flex: 1;
    background: var(--bg);
    border-radius: var(--radius-sm);
    padding: 5px 8px;
    text-align: center;
    border: 1px solid var(--border);
  }
  .site-bal .bl { font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dim); }
  .site-bal .bv { font-size: 11px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }

  /* ─── Markets view ─── */
  .market-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s ease;
    position: relative;
  }
  .market-item:hover { background: var(--bg3); }
  .market-item .plat-stripe {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    border-radius: 0 2px 2px 0;
  }
  .market-item.critical .plat-stripe { box-shadow: inset 0 0 0 3px var(--red); }
  .market-logo {
    width: 32px; height: 32px; border-radius: var(--radius);
    background: var(--bg3); display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 600; color: var(--text-secondary); flex-shrink: 0;
    overflow: hidden;
  }
  .market-logo img { width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius); }
  .market-info { flex: 1; min-width: 0; }
  .market-title {
    font-size: 12px; font-weight: 500; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.3;
  }
  .market-meta { font-size: 11px; color: var(--dim); margin-top: 3px; display: flex; align-items: center; gap: 6px; }
  .plat-tag {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 7px; border-radius: 4px;
    font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
    white-space: nowrap;
  }
  .plat-tag .plat-dot-sm {
    width: 6px; height: 6px; border-radius: 50%;
  }
  .market-price { text-align: right; flex-shrink: 0; }
  .market-price .prob { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .market-price .prob.lock { color: var(--green); }
  .market-price .prob.hammer { color: var(--yellow); }
  .market-price .prob.good { color: var(--cyan); }
  .market-price .vol { font-size: 10px; color: var(--dim); margin-top: 2px; font-variant-numeric: tabular-nums; }
  .market-price .time { font-size: 10px; color: var(--dim); font-variant-numeric: tabular-nums; }
  .market-price .time.critical { color: var(--red); font-weight: 600; }

  /* Badge */
  .badge {
    display: inline-block; padding: 2px 7px; border-radius: 4px;
    font-size: 10px; font-weight: 600; letter-spacing: 0.2px;
  }
  .badge.lock { background: var(--green-soft); color: var(--green); }
  .badge.hammer { background: var(--yellow-soft); color: var(--yellow); }
  .badge.critical { background: var(--red-soft); color: var(--red); }
  .badge.good { background: rgba(121,192,255,0.1); color: var(--cyan); }

  /* Center Panel */
  .panel-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg);
    transition: background 0.3s ease;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 4px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
  }
  .tab {
    padding: 12px 16px;
    font-size: 12px;
    font-weight: 500;
    color: var(--dim);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s ease;
  }
  .tab:hover { color: var(--text-secondary); }
  .tab.active { color: var(--text); border-bottom-color: var(--blue); }

  /* Terminal content */
  .terminal {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    font-size: 13px;
    line-height: 1.7;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .terminal::-webkit-scrollbar { width: 6px; }
  .terminal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
  .terminal-line { white-space: pre-wrap; }
  .terminal-line.header-line {
    color: var(--text);
    font-weight: 600;
    font-size: 13px;
    margin-top: 16px;
    margin-bottom: 4px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
  .terminal-line .green { color: var(--green); }
  .terminal-line .red { color: var(--red); }
  .terminal-line .yellow { color: var(--yellow); }
  .terminal-line .dim { color: var(--dim); }
  .terminal-line .cyan { color: var(--cyan); }
  .terminal-line .blue { color: var(--blue); }

  /* Tracking table */
  .tracking-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
  .tracking-table th {
    text-align: left; padding: 8px 10px; color: var(--dim);
    font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
  }
  .tracking-table td {
    padding: 10px 10px;
    border-bottom: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
  }
  .tracking-table tr { transition: background 0.15s ease; }
  .tracking-table tr:hover { background: var(--bg3); }
  .tracking-table .prob-cell { font-weight: 600; }

  /* Calibration bars */
  .cal-bar-wrap { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
  .cal-bar-label { width: 110px; font-size: 12px; color: var(--text-secondary); font-weight: 500; }
  .cal-bar {
    flex: 1; height: 24px;
    background: var(--bg-card);
    border-radius: var(--radius-sm);
    position: relative; overflow: hidden;
    border: 1px solid var(--border);
  }
  .cal-bar-fill { height: 100%; border-radius: var(--radius-sm); transition: width 0.6s ease; }
  .cal-bar-text { position: absolute; right: 8px; top: 3px; font-size: 11px; font-weight: 500; color: var(--text); }

  /* Right Panel - Wallet + Agent */
  .panel-right {
    width: 272px;
    min-width: 272px;
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    background: var(--bg2);
    transition: background 0.3s ease;
  }
  .wallet-section { padding: 16px; border-bottom: 1px solid var(--border); }
  .wallet-title {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.8px; color: var(--dim); margin-bottom: 12px;
  }
  .wallet-balance { font-size: 30px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
  .wallet-balance .label { font-size: 11px; color: var(--dim); display: block; margin-bottom: 4px; font-weight: 500; }
  .wallet-row { display: flex; justify-content: space-between; font-size: 12px; padding: 5px 0; }
  .wallet-row .label { color: var(--dim); font-weight: 400; }
  .wallet-row .val { font-weight: 600; font-variant-numeric: tabular-nums; }
  .wallet-row .val.green { color: var(--green); }
  .wallet-row .val.red { color: var(--red); }

  .agent-section { padding: 16px; flex: 1; overflow: hidden; }
  .agent-title {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.8px; color: var(--dim); margin-bottom: 12px;
  }
  .agent-status { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 10px; font-weight: 500; }
  .agent-log {
    font-size: 11px; color: var(--dim); line-height: 1.6;
    max-height: 300px; overflow-y: auto;
  }
  .agent-log .entry { padding: 3px 0; border-bottom: 1px solid var(--border); }
  .agent-log .entry .time { color: var(--blue); font-weight: 500; font-variant-numeric: tabular-nums; }

  /* Progress ring */
  .progress-wrap { text-align: center; padding: 14px 0; }
  .progress-ring { position: relative; display: inline-block; }
  .progress-ring svg { transform: rotate(-90deg); }
  .progress-ring .label {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .panel-left { width: 240px; min-width: 240px; }
    .panel-right { width: 220px; min-width: 220px; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="status-dot"></div>
    <div class="logo">&#128094; SNEAKERS <span>Trading Terminal</span></div>
  </div>
  <div class="header-right">
    <div>Markets: <span class="val" id="h-markets">-</span></div>
    <div>Snapshots: <span class="val" id="h-snapshots">-</span></div>
    <div>Win Rate: <span class="val" id="h-winrate">-</span></div>
    <div id="h-clock" style="color:var(--cyan)"></div>
    <div class="theme-toggle">
      <button class="theme-btn" id="btn-light" title="Light mode" onclick="setTheme('light')">&#9788;</button>
      <button class="theme-btn active" id="btn-dark" title="Dark mode" onclick="setTheme('dark')">&#9790;</button>
    </div>
  </div>
</div>

<div class="main">
  <!-- LEFT: Sites / Markets -->
  <div class="panel-left">
    <div class="left-toggle">
      <button class="left-toggle-btn active" id="toggle-sites" onclick="setLeftView('sites')">
        <span class="icon">&#9673;</span> Sites
      </button>
      <button class="left-toggle-btn" id="toggle-markets" onclick="setLeftView('markets')">
        <span class="icon">&#9776;</span> Markets <span class="count" id="market-count" style="margin-left:4px">0</span>
      </button>
    </div>
    <div class="left-content" id="left-content"></div>
  </div>

  <!-- CENTER: Terminal -->
  <div class="panel-center">
    <div class="tabs">
      <div class="tab active" data-tab="tracking">Tracking</div>
      <div class="tab" data-tab="calibration">Calibration</div>
      <div class="tab" data-tab="agent">Agent</div>
      <div class="tab" data-tab="log">Live Log</div>
    </div>
    <div class="terminal" id="terminal"></div>
  </div>

  <!-- RIGHT: Wallet -->
  <div class="panel-right">
    <div class="wallet-section">
      <div class="wallet-title">Wallet</div>
      <div class="wallet-balance">
        <span class="label">Available Capital</span>
        $<span id="w-available">5,000</span>
      </div>
      <div style="margin-top:10px">
        <div class="wallet-row"><span class="label">Deployed</span><span class="val" id="w-deployed">$0</span></div>
        <div class="wallet-row"><span class="label">Profit (est)</span><span class="val green" id="w-profit">$0</span></div>
        <div class="wallet-row"><span class="label">Trades Today</span><span class="val" id="w-trades">0</span></div>
      </div>
    </div>
    <div class="wallet-section">
      <div class="wallet-title">Daily Target</div>
      <div class="progress-wrap">
        <div class="progress-ring">
          <svg width="100" height="100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg3)" stroke-width="6"/>
            <circle id="progress-circle" cx="50" cy="50" r="42" fill="none" stroke="var(--green)" stroke-width="6"
              stroke-dasharray="264" stroke-dashoffset="264" stroke-linecap="round"/>
          </svg>
          <div class="label"><span id="w-progress">0</span><span style="font-size:10px;color:var(--dim)">/15</span></div>
        </div>
      </div>
    </div>
    <div class="wallet-section" style="border-bottom:none">
      <div class="wallet-title">All-Time Stats</div>
      <div class="wallet-row"><span class="label">Tracked</span><span class="val" id="w-tracked">0</span></div>
      <div class="wallet-row"><span class="label">Resolved</span><span class="val" id="w-resolved">0</span></div>
      <div class="wallet-row"><span class="label">Win Rate</span><span class="val green" id="w-winrate">0%</span></div>
    </div>
    <div class="agent-section">
      <div class="agent-title">Agent</div>
      <div class="agent-status">
        <div class="status-dot"></div>
        <span>Scanning <span id="a-platforms">Limitless, Crypto.com</span></span>
      </div>
      <div class="agent-log" id="agent-log"></div>
    </div>
  </div>
</div>

<script>
const state = { markets: [], tab: 'tracking', leftView: 'sites', logs: [], platformWallets: {} };

// ─── Platform registry ───────────────────────────────────────────────────
const PLATFORMS = {
  'Limitless':   { color: 'var(--plat-limitless)',   abbr: 'LMT', desc: 'Crypto & sports prediction markets', category: 'Prediction' },
  'Crypto.com':  { color: 'var(--plat-crypto)',      abbr: 'CDC', desc: 'Knock-out predictions on crypto prices', category: 'Prediction' },
  'Kalshi':      { color: 'var(--plat-kalshi)',      abbr: 'KSH', desc: 'Regulated US prediction exchange', category: 'Prediction' },
  'Polymarket':  { color: 'var(--plat-polymarket)',   abbr: 'PLY', desc: 'Decentralized prediction market on Polygon', category: 'Prediction' },
  'Coinbase':    { color: 'var(--plat-coinbase)',     abbr: 'CB',  desc: 'Crypto exchange & prediction markets', category: 'Exchange' },
  'Robinhood':   { color: 'var(--plat-robinhood)',    abbr: 'RH',  desc: 'Stock & crypto trading with predictions', category: 'Exchange' },
  'DraftKings':  { color: 'var(--plat-draftkings)',   abbr: 'DK',  desc: 'DraftKings Predicts — sports & event markets', category: 'Sportsbook' },
  'FanDuel':     { color: 'var(--plat-fanduel)',      abbr: 'FD',  desc: 'FanDuel Predicts — sports prediction markets', category: 'Sportsbook' },
  'Bet365':      { color: 'var(--plat-bet365)',       abbr: 'B365', desc: 'Bet365 Predicts — global sports predictions', category: 'Sportsbook' },
  'NoVig':       { color: 'var(--plat-novig)',        abbr: 'NV',  desc: 'No-vig sports betting exchange', category: 'Sportsbook' },
  'Betr':        { color: 'var(--plat-betr)',         abbr: 'BTR', desc: 'Micro-betting & predictions platform', category: 'Sportsbook' },
  'Underdog':    { color: 'var(--plat-underdog)',     abbr: 'UD',  desc: 'Fantasy sports & pick predictions', category: 'Sportsbook' },
  'PredictIt':   { color: 'var(--plat-predictit)',    abbr: 'PIT', desc: 'Political prediction market (winding down)', category: 'Prediction' },
  'Metaculus':   { color: 'var(--plat-metaculus)',     abbr: 'MET', desc: 'Community forecasting platform', category: 'Community' },
  'Manifold':    { color: 'var(--plat-manifold)',      abbr: 'MFD', desc: 'Play-money prediction market', category: 'Community' },
};

function getPlatColor(name) {
  return PLATFORMS[name]?.color || 'var(--plat-default)';
}
function getPlatAbbr(name) {
  return PLATFORMS[name]?.abbr || name.substring(0,3).toUpperCase();
}

// ─── Theme ───────────────────────────────────────────────────────────────
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('btn-light').classList.toggle('active', theme === 'light');
  document.getElementById('btn-dark').classList.toggle('active', theme === 'dark');
  localStorage.setItem('sneakers-theme', theme);
}
// Restore saved theme
const savedTheme = localStorage.getItem('sneakers-theme') || 'dark';
if (savedTheme !== 'dark') setTheme(savedTheme);

// ─── Left panel view toggle ──────────────────────────────────────────────
function setLeftView(view) {
  state.leftView = view;
  document.getElementById('toggle-sites').classList.toggle('active', view === 'sites');
  document.getElementById('toggle-markets').classList.toggle('active', view === 'markets');
  renderLeftPanel();
}

function renderLeftPanel() {
  if (state.leftView === 'sites') renderSites();
  else renderMarkets();
}

// ─── Sites view ──────────────────────────────────────────────────────────
let platformConfigs = [];
let expandedSite = null;

async function fetchPlatformConfigs() {
  try {
    platformConfigs = await (await fetch('/api/platforms')).json();
  } catch { platformConfigs = []; }
}

function toggleSite(name) {
  expandedSite = expandedSite === name ? null : name;
  renderSitesHTML();
}

async function saveKey(envKey, inputId) {
  const input = document.getElementById(inputId);
  const val = input.value.trim();
  if (!val) return;
  try {
    const r = await fetch('/api/platforms/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envKey: envKey, value: val }),
    });
    if (r.ok) {
      input.value = '';
      input.placeholder = 'Saved! Refreshing...';
      addLog('Key saved: ' + envKey);
      await fetchPlatformConfigs();
      renderSitesHTML();
    }
  } catch { addLog('Failed to save key: ' + envKey); }
}

async function testConnection(name) {
  const safeId = name.replace(/[^a-zA-Z]/g, '');
  const statusEl = document.getElementById('conn-status-' + safeId);
  if (statusEl) {
    statusEl.innerHTML = '<span class="site-conn-dot" style="background:var(--yellow)"></span><span style="color:var(--yellow)">Testing connection...</span>';
  }
  await fetchPlatformConfigs();
  renderSitesHTML();
  addLog('Connection test: ' + name);
}

function renderSites() {
  fetchPlatformConfigs().then(() => renderSitesHTML());
}

function renderSitesHTML() {
  const el = document.getElementById('left-content');
  let html = '<div class="panel-title"><span>Prediction Market Sites</span><span class="count">' + platformConfigs.length + '</span></div>';

  platformConfigs.forEach(function(plat) {
    const p = PLATFORMS[plat.name] || { color: 'var(--plat-default)', desc: 'Prediction market', abbr: '???' };
    const pw = state.platformWallets?.[plat.name] || {};
    const isOpen = expandedSite === plat.name;
    const safeId = plat.name.replace(/[^a-zA-Z]/g, '');
    const mktCount = state.markets.filter(function(m) { return m.platform === plat.name; }).length;
    const dataOn = plat.canSeeData;
    const tradeOn = plat.canTrade;

    html += '<div class="site-card">';

    html += '<div class="site-card-top" onclick="toggleSite(\\'' + plat.name + '\\')">';
    html += '<div class="site-name"><span class="site-dot" style="background:' + p.color + ((dataOn || tradeOn) ? ';box-shadow:0 0 6px ' + p.color : '') + '"></span>' + plat.name + '</div>';
    html += '<div class="site-lights">';
    html += '<div class="site-light"><span class="bulb ' + (dataOn ? 'on data-on' : '') + '"></span>Data</div>';
    html += '<div class="site-light"><span class="bulb ' + (tradeOn ? 'on trade-on' : '') + '"></span>Trade</div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="site-expand ' + (isOpen ? 'open' : '') + '">';
    html += '<div class="site-detail">';

    html += '<div class="site-meta">' + p.desc + (mktCount > 0 ? ' &middot; <span style="color:var(--text-secondary)">' + mktCount + ' active</span>' : '') + '</div>';

    html += '<div class="site-conn-info" id="conn-status-' + safeId + '">';
    html += '<span class="site-conn-dot" style="background:' + (dataOn ? 'var(--green)' : 'var(--dim)') + '"></span>';
    html += '<span style="color:' + (dataOn ? 'var(--green)' : 'var(--dim)') + '">Data: ' + (dataOn ? 'Live' : 'Off') + '</span>';
    html += '<span style="margin:0 6px;color:var(--border)">|</span>';
    html += '<span class="site-conn-dot" style="background:' + (tradeOn ? 'var(--blue)' : 'var(--dim)') + '"></span>';
    html += '<span style="color:' + (tradeOn ? 'var(--blue)' : 'var(--dim)') + '">Trade: ' + (tradeOn ? 'Ready' : 'Off') + '</span>';
    if (plat.autoExecute) html += '<span style="margin-left:auto;color:var(--yellow);font-weight:500">AUTO-EXEC</span>';
    html += '</div>';

    plat.keys.forEach(function(k, i) {
      var inputId = 'key-' + safeId + '-' + i;
      html += '<div class="site-key-row">';
      html += '<span class="site-key-label">' + k.label + '</span>';
      html += '<input class="site-key-input ' + (k.hasValue ? 'has-value' : '') + '" id="' + inputId + '" type="password" placeholder="' + (k.hasValue ? k.masked : 'Enter ' + k.label.toLowerCase() + '...') + '" autocomplete="off">';
      html += '<button class="site-btn save" style="flex:none;width:46px" onclick="saveKey(\\'' + k.envKey + '\\', \\'' + inputId + '\\')">Save</button>';
      html += '</div>';
    });

    html += '<div class="site-actions">';
    html += '<button class="site-btn primary" onclick="testConnection(\\'' + plat.name + '\\')">Test Connection</button>';
    html += '</div>';

    if (plat.canSeeData && pw.idle != null) {
      var idle = '$' + Number(pw.idle).toLocaleString();
      var invested = '$' + Number(pw.invested || 0).toLocaleString();
      var yieldVal = pw.yield || 0;
      var yieldStr = (yieldVal >= 0 ? '+$' : '-$') + Math.abs(yieldVal).toLocaleString();
      html += '<div class="site-balances">';
      html += '<div class="site-bal"><div class="bl">Idle</div><div class="bv" style="color:var(--text-secondary)">' + idle + '</div></div>';
      html += '<div class="site-bal"><div class="bl">Invested</div><div class="bv" style="color:var(--blue)">' + invested + '</div></div>';
      html += '<div class="site-bal"><div class="bl">Yield</div><div class="bv" style="color:' + (yieldVal > 0 ? 'var(--green)' : yieldVal < 0 ? 'var(--red)' : 'var(--dim)') + '">' + yieldStr + '</div></div>';
      html += '</div>';
    }

    html += '</div></div>';
    html += '</div>';
  });

  el.innerHTML = html;
}

// ─── Markets view ────────────────────────────────────────────────────────
function renderMarkets() {
  const el = document.getElementById('left-content');
  document.getElementById('market-count').textContent = state.markets.length;
  document.getElementById('h-markets').textContent = state.markets.length;

  const sorted = [...state.markets].sort((a, b) => {
    const urgOrder = { CRITICAL: 0, HIGH: 1, NORMAL: 2, '': 3 };
    const ua = urgOrder[a.urgency] ?? 3;
    const ub = urgOrder[b.urgency] ?? 3;
    if (ua !== ub) return ua - ub;
    return a.secondsToExpiry - b.secondsToExpiry;
  });

  let html = '<div class="panel-title"><span>All Markets</span><span class="count">' + sorted.length + '</span></div>';

  if (sorted.length === 0) {
    html += '<div style="padding:32px 16px;text-align:center;color:var(--dim);font-size:12px">No markets loaded yet...</div>';
  }

  sorted.forEach(m => {
    const maxP = Math.max(m.yesPrice, m.noPrice);
    const probPct = (maxP * 100).toFixed(1);
    const side = m.yesPrice >= m.noPrice ? 'YES' : 'NO';
    const cls = m.confidence === 'LOCK' ? 'lock' : m.confidence === 'HAMMER' ? 'hammer' : 'good';
    const timeStr = formatTime(m.secondsToExpiry);
    const timeCls = m.secondsToExpiry < 120 ? 'critical' : '';
    const platColor = getPlatColor(m.platform);
    const platAbbr = getPlatAbbr(m.platform);

    const logoHtml = m.logo
      ? '<img src="' + m.logo + '" onerror="this.parentElement.textContent=\\'' + m.asset.substring(0,3) + '\\'">'
      : m.asset.substring(0, 3);

    html += '<div class="market-item" data-id="' + m.id + '">' +
      '<div class="plat-stripe" style="background:' + platColor + '"></div>' +
      '<div class="market-logo" style="border:1.5px solid ' + platColor + '40">' + logoHtml + '</div>' +
      '<div class="market-info">' +
        '<div class="market-title">' + esc(m.title) + '</div>' +
        '<div class="market-meta">' +
          '<span class="plat-tag" style="background:' + platColor + '18;color:' + platColor + ';border:1px solid ' + platColor + '30"><span class="plat-dot-sm" style="background:' + platColor + '"></span>' + m.platform + '</span>' +
          (m.confidence ? '<span class="badge ' + cls + '">' + m.confidence + '</span> ' : '') +
          '<span style="color:var(--dim);font-size:9px">' + m.asset + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="market-price">' +
        '<div class="prob ' + cls + '">' + probPct + '%</div>' +
        '<div class="time ' + timeCls + '">' + side + ' · ' + timeStr + '</div>' +
        '<div class="vol">Vol: ' + m.volume + '</div>' +
      '</div>' +
    '</div>';
  });

  el.innerHTML = html;
}

// ─── WebSocket ────────────────────────────────────────────────────────────
const ws = new WebSocket('ws://' + location.host);
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'MARKETS') {
    state.markets = msg.data;
    renderLeftPanel();
    if (state.tab === 'tracking') renderTracking();
    addLog('Scan complete: ' + msg.data.length + ' markets');
  }
};
ws.onclose = () => addLog('WebSocket disconnected — reconnecting...');

// ─── Tabs ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    state.tab = t.dataset.tab;
    renderTab();
  });
});

function renderTab() {
  if (state.tab === 'tracking') renderTracking();
  else if (state.tab === 'calibration') fetchCalibration();
  else if (state.tab === 'agent') fetchAgent();
  else if (state.tab === 'log') renderLog();
}

function renderTracking() {
  const el = document.getElementById('terminal');
  const opps = state.markets.filter(m => Math.max(m.yesPrice, m.noPrice) >= 0.95);
  const critical = opps.filter(m => m.secondsToExpiry < 120);
  const high = opps.filter(m => m.secondsToExpiry >= 120 && m.secondsToExpiry < 300);
  const normal = opps.filter(m => m.secondsToExpiry >= 300 && m.secondsToExpiry < 600);
  const watching = opps.filter(m => m.secondsToExpiry >= 600);

  let html = '';

  if (critical.length > 0) {
    html += '<div class="terminal-line header-line" style="color:var(--red)">CRITICAL — EXECUTE NOW (' + critical.length + ')</div>';
    html += makeTable(critical);
  }
  if (high.length > 0) {
    html += '<div class="terminal-line header-line" style="color:var(--yellow)">HIGH PRIORITY — 2-5 min (' + high.length + ')</div>';
    html += makeTable(high);
  }
  if (normal.length > 0) {
    html += '<div class="terminal-line header-line">MONITORING — 5-10 min (' + normal.length + ')</div>';
    html += makeTable(normal);
  }
  if (watching.length > 0) {
    html += '<div class="terminal-line header-line" style="color:var(--dim)">WATCHING — 10+ min (' + watching.length + ')</div>';
    html += makeTable(watching);
  }
  if (opps.length === 0) {
    html += '<div class="terminal-line dim" style="margin-top:40px;text-align:center">No 95%+ opportunities in the current scan window.<br>Waiting for markets to approach expiry...</div>';
  }

  html += '<div class="terminal-line dim" style="margin-top:16px">Total markets: ' + state.markets.length + ' | 95%+ opportunities: ' + opps.length + ' | Updated: ' + new Date().toLocaleTimeString() + '</div>';
  el.innerHTML = html;
}

function makeTable(markets) {
  let h = '<table class="tracking-table"><thead><tr>' +
    '<th>Platform</th><th>Asset</th><th>Market</th><th>Side</th><th>Prob</th><th>Confidence</th><th>Expires</th><th>Volume</th>' +
    '</tr></thead><tbody>';
  markets.forEach(m => {
    const maxP = Math.max(m.yesPrice, m.noPrice);
    const side = m.yesPrice >= m.noPrice ? 'YES' : 'NO';
    const pct = (maxP * 100).toFixed(1) + '%';
    const cls = m.confidence === 'LOCK' ? 'green' : m.confidence === 'HAMMER' ? 'yellow' : 'cyan';
    const platColor = getPlatColor(m.platform);
    const platAbbr = getPlatAbbr(m.platform);
    h += '<tr>' +
      '<td><span class="plat-tag" style="background:' + platColor + '18;color:' + platColor + ';border:1px solid ' + platColor + '30"><span class="plat-dot-sm" style="background:' + platColor + '"></span>' + m.platform + '</span></td>' +
      '<td>' + m.asset + '</td>' +
      '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.title) + '</td>' +
      '<td>' + side + '</td>' +
      '<td class="prob-cell" style="color:var(--' + cls + ')">' + pct + '</td>' +
      '<td><span class="badge ' + cls + '">' + (m.confidence || '-') + '</span></td>' +
      '<td style="color:' + (m.secondsToExpiry < 120 ? 'var(--red)' : 'var(--text)') + '">' + formatTime(m.secondsToExpiry) + '</td>' +
      '<td class="dim">' + m.volume + '</td>' +
    '</tr>';
  });
  return h + '</tbody></table>';
}

async function fetchCalibration() {
  const el = document.getElementById('terminal');
  try {
    const data = await (await fetch('/api/calibration')).json();
    let html = '<div class="terminal-line header-line">CALIBRATION — Actual Win Rates by Probability Band</div>';
    html += '<div class="terminal-line dim" style="margin-bottom:12px">Do these probabilities hold up? Compare actual vs expected.</div>';

    if (data.length === 0) {
      html += '<div class="terminal-line dim">No calibration data yet. Run npm run calibration to start collecting.</div>';
    } else {
      data.forEach(b => {
        const wr = b.resolved > 0 ? ((b.wins / b.resolved) * 100).toFixed(1) : 0;
        const color = wr >= 97 ? 'var(--green)' : wr >= 90 ? 'var(--yellow)' : 'var(--red)';
        const barW = Math.min(100, wr);
        html += '<div class="cal-bar-wrap">' +
          '<div class="cal-bar-label">' + b.band + '</div>' +
          '<div class="cal-bar">' +
            '<div class="cal-bar-fill" style="width:' + barW + '%;background:' + color + '"></div>' +
            '<div class="cal-bar-text">' + (b.resolved > 0 ? wr + '% (' + b.wins + '/' + b.resolved + ')' : 'no data') + '</div>' +
          '</div>' +
          '<div style="width:60px;text-align:right;font-size:10px;color:var(--dim)">' + b.total + ' total</div>' +
        '</div>';
      });
    }
    el.innerHTML = html;
  } catch { el.innerHTML = '<div class="terminal-line dim">Failed to load calibration data.</div>'; }
}

async function fetchAgent() {
  const el = document.getElementById('terminal');
  try {
    const [agent, corr] = await Promise.all([
      (await fetch('/api/agent')).json(),
      (await fetch('/api/correlations')).json(),
    ]);

    let html = '<div class="terminal-line header-line">AGENT STATUS</div>';
    html += '<div class="terminal-line">Status: <span class="green">RUNNING</span></div>';
    html += '<div class="terminal-line">Uptime: ' + Math.floor(agent.uptime / 60) + 'm ' + Math.floor(agent.uptime % 60) + 's</div>';
    html += '<div class="terminal-line">Snapshots collected: <span class="cyan">' + agent.snapshots + '</span></div>';
    html += '<div class="terminal-line">Outcomes tracked: <span class="cyan">' + agent.outcomes + '</span></div>';
    html += '<div class="terminal-line">Scanning: ' + agent.scanning.join(', ') + '</div>';

    if (corr.hourly && corr.hourly.length > 0) {
      html += '<div class="terminal-line header-line" style="margin-top:16px">HOURLY WIN RATES (UTC)</div>';
      const maxTotal = Math.max(...corr.hourly.map(h => h.total));
      corr.hourly.forEach(h => {
        const wr = h.resolved > 0 ? ((h.wins / h.resolved) * 100).toFixed(0) : '-';
        const barW = (h.total / maxTotal) * 100;
        const color = h.resolved > 0 && (h.wins/h.resolved) >= 0.95 ? 'var(--green)' : 'var(--yellow)';
        html += '<div class="cal-bar-wrap">' +
          '<div class="cal-bar-label">' + String(h.hour).padStart(2,'0') + ':00</div>' +
          '<div class="cal-bar"><div class="cal-bar-fill" style="width:' + barW + '%;background:' + color + '"></div>' +
          '<div class="cal-bar-text">' + h.total + ' mkts' + (h.resolved > 0 ? ' · ' + wr + '% win' : '') + '</div></div>' +
        '</div>';
      });
    }

    el.innerHTML = html;
  } catch { el.innerHTML = '<div class="terminal-line dim">Failed to load agent data.</div>'; }
}

function renderLog() {
  const el = document.getElementById('terminal');
  el.innerHTML = state.logs.map(l =>
    '<div class="terminal-line"><span class="dim">' + l.time + '</span> ' + esc(l.msg) + '</div>'
  ).join('');
}

// ─── Wallet Updates ───────────────────────────────────────────────────────
async function updateWallet() {
  try {
    const w = await (await fetch('/api/wallet')).json();
    document.getElementById('w-available').textContent = Number(w.available).toLocaleString();
    document.getElementById('w-deployed').textContent = '$' + Number(w.deployed).toLocaleString();
    document.getElementById('w-profit').textContent = '$' + Number(w.profitPotential).toLocaleString();
    document.getElementById('w-trades').textContent = w.tradesToday;
    document.getElementById('w-progress').textContent = w.tradesToday;
    document.getElementById('w-tracked').textContent = w.allTimeTracked;
    document.getElementById('w-resolved').textContent = w.allTimeResolved;
    document.getElementById('w-winrate').textContent = w.winRate + '%';
    document.getElementById('h-winrate').textContent = w.winRate + '%';
    document.getElementById('h-snapshots').textContent = w.allTimeTracked;

    const pct = Math.min(1, w.tradesToday / 15);
    const offset = 264 - (264 * pct);
    document.getElementById('progress-circle').style.strokeDashoffset = offset;

    // Store per-platform wallet data for sidebar
    if (w.platforms) {
      state.platformWallets = {};
      w.platforms.forEach(p => { state.platformWallets[p.platform] = p; });
      renderLeftPanel();
    }
  } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatTime(s) {
  if (s < 60) return Math.floor(s) + 's';
  if (s < 3600) return Math.floor(s/60) + 'm ' + Math.floor(s%60) + 's';
  return Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function addLog(msg) {
  state.logs.unshift({ time: new Date().toLocaleTimeString(), msg });
  if (state.logs.length > 200) state.logs.pop();
  const el = document.getElementById('agent-log');
  el.innerHTML = state.logs.slice(0, 20).map(l =>
    '<div class="entry"><span class="time">' + l.time + '</span> ' + esc(l.msg) + '</div>'
  ).join('');
  if (state.tab === 'log') renderLog();
}

// ─── Clock ────────────────────────────────────────────────────────────────
setInterval(() => {
  document.getElementById('h-clock').textContent = new Date().toLocaleTimeString();
}, 1000);

// ─── Initial Load ─────────────────────────────────────────────────────────
(async () => {
  renderSites(); // Show sites view immediately
  try {
    const markets = await (await fetch('/api/markets')).json();
    state.markets = markets;
    renderLeftPanel();
    renderTracking();
    addLog('Terminal connected — ' + markets.length + ' markets loaded');
  } catch { addLog('Failed to fetch initial markets'); }
  updateWallet();
  setInterval(updateWallet, 10000);
})();
</script>
</body>
</html>`;

export default server;
