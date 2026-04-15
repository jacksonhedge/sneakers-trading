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
import NOAAWeatherService, { WEATHER_LOCATIONS, buildTemperatureDistribution, TemperatureForecast } from './services/noaa-weather-service.js';
import PolymarketWeatherScanner from './services/polymarket-weather-scanner.js';
import WeatherEdgeCalculator from './services/weather-edge-calculator.js';
import WeatherEnsemble from './services/weather-ensemble.js';
import RadarScreenshotService from './services/radar-screenshot-service.js';
import KalshiWeatherScanner from './services/kalshi-weather-scanner.js';
import ManifoldWeatherScanner from './services/manifold-weather-scanner.js';
import NexradService from './services/nexrad-service.js';
import BlitzortungService from './services/blitzortung-service.js';
import MovebankService from './services/movebank-service.js';
import EBirdService from './services/ebird-service.js';
import TomorrowService from './services/tomorrow-service.js';
import INaturalistService from './services/inaturalist-service.js';
import OBISMarineService from './services/obis-marine-service.js';
import OceanBuoyService from './services/ocean-buoy-service.js';
import FlightWeatherService from './services/flight-weather-service.js';
import StreamGaugeService from './services/stream-gauge-service.js';
import SolarWeatherService from './services/solar-weather-service.js';
import PowerGridService from './services/power-grid-service.js';
import FAAStatusService from './services/faa-status-service.js';
import ConvectionService from './services/convection-service.js';
import TidalService from './services/tidal-service.js';
import SSTService from './services/sst-service.js';
import RadiosondeService from './services/radiosonde-service.js';
import SoilMoistureService from './services/soil-moisture-service.js';
import CrossPlatformEdgeFinder from './services/cross-platform-edge-finder.js';
import SneakersEngine from './services/sneakers-engine.js';

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

// ─── Weather Services ────────────────────────────────────────────────────────

const weatherScanner = new PolymarketWeatherScanner();
const weatherNoaa = new NOAAWeatherService();
const weatherEnsemble = new WeatherEnsemble();
const radarService = new RadarScreenshotService();
const kalshiScanner = new KalshiWeatherScanner();
const manifoldScanner = new ManifoldWeatherScanner();
const nexradService = new NexradService();
const blitzortungService = new BlitzortungService();

const movebankService = new MovebankService();
const ebirdService = new EBirdService();
const tomorrowService = new TomorrowService();
const inatService = new INaturalistService();
const obisService = new OBISMarineService();
const buoyService = new OceanBuoyService();
const flightService = new FlightWeatherService();
const streamService = new StreamGaugeService();
const solarService = new SolarWeatherService();
const powerService = new PowerGridService();
const faaService = new FAAStatusService();
const convectionService = new ConvectionService();
const tidalService = new TidalService();
const sstService = new SSTService();
const radiosondeService = new RadiosondeService();
const soilMoistureService = new SoilMoistureService();
const edgeFinder = new CrossPlatformEdgeFinder({
  bankroll: parseFloat(process.env.WEATHER_BANKROLL || '5000'),
  kellyMultiplier: 0.5,
  minEdge: 0.06,
  maxPositionSize: parseFloat(process.env.WEATHER_MAX_POSITION || '500'),
  minExpectedProfit: 2,
});

// Start Blitzortung WebSocket for live lightning
blitzortungService.connect();

// ─── Sneakers Trading Engine ────────────────────────────────────────────────
const sneakersEngine = new SneakersEngine({
  bankroll: parseFloat(process.env.WEATHER_BANKROLL || '250'),
  maxPositionUsdc: 40,
  minEdge: 0.08,
  scanIntervalMs: 60_000,
  autoExecute: process.env.WEATHER_AUTO_EXECUTE === 'true',
});

// Broadcast engine state to all WebSocket clients
sneakersEngine.onStateChange((state) => {
  const payload = {
    type: 'ENGINE_STATE',
    data: {
      status: state.status,
      lastScan: state.lastScan,
      scanCount: state.scanCount,
      edgeCount: state.edges.length,
      marketCount: state.markets.length,
      balance: state.balance,
      deployed: state.deployed,
      bankrollRemaining: state.bankrollRemaining,
      tradesExecuted: state.tradesExecuted,
      trades: state.trades.slice(-20),
      topEdges: state.edges.slice(0, 15).map(e => ({
        direction: e.direction,
        outcome: e.outcomeLabel,
        location: e.location,
        targetDate: e.targetDate,
        modelProb: e.modelProbability,
        marketPrice: e.marketPrice,
        edge: e.edge,
        expectedProfit: e.expectedProfit,
        confidence: e.confidence,
      })),
    },
  };
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
});

// Start engine after server is up
setTimeout(() => sneakersEngine.start(), 2000);

// Engine API endpoints
app.get('/api/engine/state', (_req, res) => {
  const s = sneakersEngine.getState();
  res.json({
    status: s.status,
    lastScan: s.lastScan,
    scanCount: s.scanCount,
    balance: s.balance,
    deployed: s.deployed,
    bankrollRemaining: s.bankrollRemaining,
    tradesExecuted: s.tradesExecuted,
    edgeCount: s.edges.length,
    marketCount: s.markets.length,
    trades: s.trades,
    edges: s.edges.slice(0, 20),
    arbitrage: s.arbitrage.slice(0, 10),
    errors: s.errors,
  });
});

app.post('/api/engine/execute', async (_req, res) => {
  try {
    const results = await sneakersEngine.executeBestEdges(5);
    res.json({ success: true, trades: results.length, results });
  } catch (e) {
    res.json({ success: false, error: (e as Error).message });
  }
});

app.post('/api/engine/toggle-auto', express.json(), (req, res) => {
  const enabled = req.body?.enabled ?? false;
  sneakersEngine.setAutoExecute(enabled);
  res.json({ autoExecute: enabled });
});
const weatherEdgeCalc = new WeatherEdgeCalculator({
  minAbsoluteEdge: 0.05,
  maxPositionSize: 500,
  kellyMultiplier: 0.5,
  bankroll: 5000,
});

let cachedWeatherEdges: any[] = [];
let cachedMarketMovers: any[] = [];
let cachedUpstreamAlerts: any[] = [];
let cachedEnhancedData: any = {};  // multi-model, ground truth, hazards
let cachedKalshiMarkets: any[] = [];
let cachedManifoldMarkets: any[] = [];
let lastKalshiScan = 0;
let lastManifoldScan = 0;
let lastWeatherScan = 0;
const WEATHER_SCAN_INTERVAL = 60_000;

async function scanWeatherEdges(): Promise<any[]> {
  if (Date.now() - lastWeatherScan < WEATHER_SCAN_INTERVAL && cachedWeatherEdges.length > 0) {
    return cachedWeatherEdges;
  }

  try {
    const markets = await weatherScanner.scanWeatherMarkets();
    const edges: any[] = [];
    const allMovers: any[] = [];
    const allUpstreamAlerts: any[] = [];

    for (const market of markets) {
      const location = WEATHER_LOCATIONS.find(l => l.name === market.location);
      if (!location) continue;

      const noaaForecast = await weatherNoaa.fetchBestForecast(location, market.targetDate);

      // Use conditions-aware forecasting (includes wind + cloud + upstream + multi-model + ground truth + hazards)
      const { forecast, movers, upstreamAlerts, conditionsAdjustmentF, multiModel, groundTruth, hazards } = await weatherEnsemble.buildConditionsAwareForecast(
        noaaForecast, null, location, market.targetDate
      );
      if (!forecast) continue;

      // Store enhanced data for API/dashboard
      const enhKey = market.location;
      if (!cachedEnhancedData[enhKey]) cachedEnhancedData[enhKey] = {};
      if (multiModel) cachedEnhancedData[enhKey].multiModel = {
        models: multiModel.models.map(m => ({ name: m.modelName, highF: m.tempHighF })),
        agreement: multiModel.modelAgreement,
        spreadF: multiModel.ensembleSpreadF,
        bestEstimateF: multiModel.bestEstimateHighF,
        ci: multiModel.confidenceInterval,
      };
      if (groundTruth?.divergence) cachedEnhancedData[enhKey].groundTruth = {
        currentTempF: groundTruth.divergence.currentTempF,
        divergenceF: groundTruth.divergence.divergenceF,
        heatingRate: groundTruth.divergence.heatingRate,
        likelyOvershoot: groundTruth.divergence.likelyOvershoot,
        likelyUndershoot: groundTruth.divergence.likelyUndershoot,
        estimatedHighF: groundTruth.divergence.estimatedActualHighF,
        confidence: groundTruth.divergence.confidence,
      };
      if (groundTruth?.trajectory) cachedEnhancedData[enhKey].trajectory = {
        currentTempF: groundTruth.trajectory.currentTempF,
        trajectory: groundTruth.trajectory.trajectory,
        peakDetected: groundTruth.trajectory.peakDetected,
        estimatedPeakF: groundTruth.trajectory.estimatedPeakF,
        rate5min: groundTruth.trajectory.tempRate5min,
      };
      if (hazards) cachedEnhancedData[enhKey].hazards = {
        isRaining: hazards.precip.isRaining,
        precipTrend: hazards.precip.trend,
        cloudPct: hazards.clouds.currentCloudPct,
        cloudTrend: hazards.clouds.cloudTrend,
        cloudDivergence: hazards.clouds.cloudDivergence,
        stormRisk: hazards.storm.stormRisk,
        weatherDesc: hazards.storm.weatherDescription,
        tempImpactF: hazards.storm.estimatedTempImpactF,
      };

      // Collect market movers
      for (const m of movers) {
        allMovers.push({
          location: m.location,
          targetDate: m.targetDate,
          type: m.type,
          triggerHour: m.triggerHour,
          triggerTime: m.triggerTimeISO,
          direction: m.impactDirection,
          impactF: m.impactMagnitudeF,
          confidence: Math.round(m.confidence * 100),
          description: m.description,
        });
      }

      // Collect upstream alerts
      for (const a of upstreamAlerts) {
        allUpstreamAlerts.push({
          targetCity: a.targetCity,
          sentinel: a.sentinelName,
          distanceKm: a.distanceKm,
          tempDiffF: a.tempDiffF,
          cloudDiffPct: a.cloudDiffPct,
          arrivalHours: a.estimatedArrivalHours,
          direction: a.impactDirection,
          impactF: a.impactMagnitudeF,
          confidence: Math.round(a.confidence * 100),
          windMph: a.windSpeedMph,
          description: a.description,
        });
      }

      const marketEdges = weatherEdgeCalc.calculateEdges(forecast, market);
      const actionable = weatherEdgeCalc.filterActionable(marketEdges);

      for (const e of actionable) {
        edges.push({
          location: market.location,
          targetDate: market.targetDate,
          outcome: e.outcome.label,
          temperatureC: e.outcome.temperatureC,
          forecastProb: Math.round(e.forecastProbability * 1000) / 10,
          marketPrice: Math.round(e.marketPrice * 1000) / 10,
          edge: Math.round(e.edge * 1000) / 10,
          expectedProfit: e.expectedProfit,
          side: e.recommendedSide,
          size: e.recommendedSize,
          confidence: e.confidence,
          hoursOut: Math.round(e.hoursUntilResolution * 10) / 10,
          forecastHighF: forecast.pointForecastHighF,
          spreadF: forecast.modelSpreadF,
          conditionsAdj: conditionsAdjustmentF,
        });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    edges.sort((a, b) => b.expectedProfit - a.expectedProfit);
    allMovers.sort((a, b) => a.triggerHour - b.triggerHour);
    cachedWeatherEdges = edges;
    cachedMarketMovers = allMovers;
    cachedUpstreamAlerts = allUpstreamAlerts;
    lastWeatherScan = Date.now();
    return edges;
  } catch (e) {
    console.error('[Weather] Scan error:', (e as Error).message);
    return cachedWeatherEdges;
  }
}

// Weather API endpoints
app.get('/api/weather/edges', async (_req, res) => {
  try {
    const edges = await scanWeatherEdges();
    res.json(edges);
  } catch { res.json([]); }
});

app.get('/api/weather/movers', async (_req, res) => {
  try {
    await scanWeatherEdges();
    res.json(cachedMarketMovers);
  } catch { res.json([]); }
});

app.get('/api/weather/upstream', async (_req, res) => {
  try {
    await scanWeatherEdges();
    res.json(cachedUpstreamAlerts);
  } catch { res.json([]); }
});

app.get('/api/weather/enhanced', async (_req, res) => {
  try {
    await scanWeatherEdges();
    res.json(cachedEnhancedData);
  } catch { res.json({}); }
});

// ─── Cross-Platform Weather Market APIs ───────────────────────────────────

app.get('/api/weather/kalshi', async (_req, res) => {
  try {
    if (Date.now() - lastKalshiScan < 60_000 && cachedKalshiMarkets.length > 0) {
      res.json(cachedKalshiMarkets);
      return;
    }
    cachedKalshiMarkets = await kalshiScanner.scanWeatherMarkets();
    lastKalshiScan = Date.now();
    res.json(cachedKalshiMarkets);
  } catch { res.json([]); }
});

app.get('/api/weather/manifold', async (_req, res) => {
  try {
    if (Date.now() - lastManifoldScan < 120_000 && cachedManifoldMarkets.length > 0) {
      res.json(cachedManifoldMarkets);
      return;
    }
    cachedManifoldMarkets = await manifoldScanner.scanWeatherMarkets();
    lastManifoldScan = Date.now();
    res.json(cachedManifoldMarkets);
  } catch { res.json([]); }
});

app.get('/api/weather/cross-platform', async (_req, res) => {
  try {
    // Fetch all platforms in parallel
    const [polyEdges, kalshi, manifold] = await Promise.all([
      scanWeatherEdges(),
      (Date.now() - lastKalshiScan < 60_000 && cachedKalshiMarkets.length > 0)
        ? Promise.resolve(cachedKalshiMarkets)
        : kalshiScanner.scanWeatherMarkets().then(m => { cachedKalshiMarkets = m; lastKalshiScan = Date.now(); return m; }).catch(() => []),
      (Date.now() - lastManifoldScan < 120_000 && cachedManifoldMarkets.length > 0)
        ? Promise.resolve(cachedManifoldMarkets)
        : manifoldScanner.scanWeatherMarkets().then(m => { cachedManifoldMarkets = m; lastManifoldScan = Date.now(); return m; }).catch(() => []),
    ]);
    res.json({ polymarket: polyEdges, kalshi, manifold });
  } catch { res.json({ polymarket: [], kalshi: [], manifold: [] }); }
});

// ─── Cross-Platform Edge Finder API ──────────────────────────────────────

app.get('/api/weather/cross-platform-edges', async (_req, res) => {
  try {
    // Step 1: Get raw markets from both platforms + indicator signals
    const [kalshi, polymarketMarkets, indicatorData] = await Promise.all([
      (Date.now() - lastKalshiScan < 60_000 && cachedKalshiMarkets.length > 0)
        ? Promise.resolve(cachedKalshiMarkets)
        : kalshiScanner.scanWeatherMarkets().then(m => { cachedKalshiMarkets = m; lastKalshiScan = Date.now(); return m; }).catch(() => []),
      weatherScanner.scanWeatherMarkets().catch(() => []),
      Promise.all([
        faaService.getAllSignals().catch(() => []),
        convectionService.getAllSignals().catch(() => []),
        buoyService.getAllSignals().catch(() => []),
        radiosondeService.getAllSignals().catch(() => []),
      ]),
    ]);

    // Step 2: Build supporting signals per city from indicators
    const [faaSignals, capeSignals, buoySignals, radiosondeSignals] = indicatorData;
    const signalsMap = new Map<string, string[]>();
    for (const loc of WEATHER_LOCATIONS) {
      const sigs: string[] = [];
      const faa = (faaSignals as any[]).find((f: any) => f.city === loc.name);
      if (faa && faa.overallSeverity !== 'NONE') sigs.push(`FAA: ${faa.overallSeverity} (${faa.weatherType || 'delays'})`);
      const cape = (capeSignals as any[]).find((c: any) => c.city === loc.name);
      if (cape && cape.cape > 500) sigs.push(`CAPE: ${cape.cape} J/kg (${cape.convectionRisk})`);
      if (cape && cape.capEroding) sigs.push('CAP ERODING — explosive convection imminent');
      const buoy = (buoySignals as any[]).find((b: any) => b.city === loc.name);
      if (buoy && buoy.pressureTendency < -2) sigs.push(`Buoy: ${buoy.pressureTendency.toFixed(1)} hPa/3hr (falling)`);
      if (buoy && buoy.stormSignal) sigs.push('Buoy: STORM SIGNAL');
      const sonde = (radiosondeSignals as any[]).find((r: any) => r.city === loc.name);
      if (sonde && sonde.precipitableWater > 1.2) sigs.push(`PWAT: ${sonde.precipitableWater.toFixed(1)}" (heavy rain risk)`);
      if (sonde && sonde.inversionDetected) sigs.push(`Inversion at ${sonde.inversionHeight}m`);
      if (sigs.length > 0) signalsMap.set(loc.name, sigs);
    }

    // Step 3: Get forecasts for each location that has markets
    const forecastMap = new Map<string, TemperatureForecast>();
    const locationsWithMarkets = new Set<string>();
    kalshi.forEach((m: any) => locationsWithMarkets.add(m.location));
    polymarketMarkets.forEach((m: any) => locationsWithMarkets.add(m.location));

    console.log(`[Edge Finder] Markets: ${kalshi.length} Kalshi, ${polymarketMarkets.length} Polymarket, ${locationsWithMarkets.size} locations`);

    for (const locName of locationsWithMarkets) {
      const location = WEATHER_LOCATIONS.find(l => l.name === locName);
      if (!location) continue;
      try {
        // Use target dates from the markets themselves
        const marketDates = new Set<string>();
        kalshi.filter((m: any) => m.location === locName).forEach((m: any) => marketDates.add(m.targetDate));
        polymarketMarkets.filter((m: any) => m.location === locName).forEach((m: any) => marketDates.add(m.targetDate));

        for (const targetDate of marketDates) {
          const { forecast } = await weatherEnsemble.buildConditionsAwareForecast(
            await weatherNoaa.fetchBestForecast(location, targetDate),
            null, location, targetDate
          );
          if (forecast) {
            forecastMap.set(`${locName}:${targetDate}`, forecast);
          }
        }
      } catch (e) {
        console.error(`[Edge Finder] Forecast error for ${locName}: ${(e as Error).message}`);
      }
    }

    console.log(`[Edge Finder] Got ${forecastMap.size} forecasts, running edge finder...`);

    // Step 4: Find edges and arbitrage
    const result = edgeFinder.findAllEdges(forecastMap, kalshi, polymarketMarkets, signalsMap);
    console.log(`[Edge Finder] Found ${result.summary.totalEdges} edges, ${result.summary.arbitrageOpps} arb opps, $${result.summary.totalExpectedProfit} expected profit`);
    res.json(result);
  } catch (e) {
    console.error(`[Edge Finder] Error: ${(e as Error).message}`);
    res.json({ edges: [], arbitrage: [], summary: { totalEdges: 0, kalshiEdges: 0, polymarketEdges: 0, arbitrageOpps: 0, bestEdge: null, totalExpectedProfit: 0, topLocations: [] } });
  }
});

// ─── NEXRAD High-Res Radar API ────────────────────────────────────────────

app.get('/api/nexrad/conus', async (_req, res) => {
  try {
    const composite = await nexradService.fetchConusComposite();
    res.json(composite || { error: 'unavailable' });
  } catch { res.json({ error: 'fetch failed' }); }
});

app.get('/api/nexrad/station/:city', async (req, res) => {
  try {
    const location = WEATHER_LOCATIONS.find(l => l.name === req.params.city);
    if (!location) { res.status(404).json({ error: 'City not found' }); return; }
    const result = await nexradService.fetchStationRadar(location);
    res.json(result || { error: 'No NEXRAD data for this city (US only)' });
  } catch { res.json({ error: 'fetch failed' }); }
});

app.get('/api/nexrad/all', async (_req, res) => {
  try {
    const [stations, conus] = await Promise.all([
      nexradService.fetchAllStations(),
      nexradService.fetchConusComposite(),
    ]);
    res.json({ stations, conus });
  } catch { res.json({ stations: [], conus: null }); }
});

app.get('/api/nexrad/image/:filename', (req, res) => {
  try {
    const filePath = path.join(nexradService.getScreenshotDir(), req.params.filename);
    if (!fs.existsSync(filePath)) { res.status(404).send('Not found'); return; }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.send(fs.readFileSync(filePath));
  } catch { res.status(500).send('Error'); }
});

// ─── Blitzortung Lightning API ────────────────────────────────────────────

app.get('/api/lightning/status', (_req, res) => {
  try {
    const statuses = blitzortungService.getAllCityStatuses();
    res.json({
      connected: blitzortungService.isConnected(),
      totalRecentStrikes: blitzortungService.getRecentStrikeCount(),
      cities: statuses,
    });
  } catch { res.json({ connected: false, totalRecentStrikes: 0, cities: [] }); }
});

app.get('/api/lightning/city/:city', (req, res) => {
  try {
    const location = WEATHER_LOCATIONS.find(l => l.name === req.params.city);
    if (!location) { res.status(404).json({ error: 'City not found' }); return; }
    res.json(blitzortungService.getCityStatus(location));
  } catch { res.json({ error: 'fetch failed' }); }
});

app.get('/api/lightning/strikes', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 500;
    res.json(blitzortungService.getRecentStrikes(Math.min(limit, 2000)));
  } catch { res.json([]); }
});

// ─── Animal Behavioral Signal APIs ────────────────────────────────────────

app.get('/api/biosensors/movebank', async (_req, res) => {
  try {
    const signals = await movebankService.getAllSignals();
    res.json(signals);
  } catch { res.json([]); }
});

app.get('/api/biosensors/ebird', async (_req, res) => {
  try {
    const signals = await ebirdService.getAllSignals();
    res.json({ hasApiKey: ebirdService.hasApiKey(), signals });
  } catch { res.json({ hasApiKey: false, signals: [] }); }
});

app.get('/api/biosensors/inaturalist', async (_req, res) => {
  try {
    const signals = await inatService.getAllSignals();
    res.json(signals);
  } catch { res.json([]); }
});

app.get('/api/biosensors/marine', async (_req, res) => {
  try {
    const signals = await obisService.getAllSignals();
    res.json(signals);
  } catch { res.json([]); }
});

app.get('/api/biosensors/all', async (_req, res) => {
  try {
    const [movebank, ebird, inat, marine] = await Promise.all([
      movebankService.getAllSignals().catch(() => []),
      ebirdService.getAllSignals().catch(() => []),
      inatService.getAllSignals().catch(() => []),
      obisService.getAllSignals().catch(() => []),
    ]);
    res.json({ movebank, ebird, ebirdApiKey: ebirdService.hasApiKey(), inaturalist: inat, marine });
  } catch { res.json({ movebank: [], ebird: [], ebirdApiKey: false, inaturalist: [], marine: [] }); }
});

// ─── Environmental Indicators API ─────────────────────────────────────────

app.get('/api/indicators/buoys', async (_req, res) => {
  try { res.json(await buoyService.getAllSignals()); } catch { res.json([]); }
});

app.get('/api/indicators/flights', async (_req, res) => {
  try { res.json(await flightService.getAllStatuses()); } catch { res.json([]); }
});

app.get('/api/indicators/streams', async (_req, res) => {
  try { res.json(await streamService.getAllSignals()); } catch { res.json([]); }
});

app.get('/api/indicators/solar', async (_req, res) => {
  try { res.json(await solarService.getSolarSignal()); } catch { res.json({}); }
});

app.get('/api/indicators/power', async (_req, res) => {
  try { res.json(await powerService.getSignals()); } catch { res.json([]); }
});

app.get('/api/indicators/faa', async (_req, res) => {
  try { res.json(await faaService.getAllSignals()); } catch { res.json([]); }
});

app.get('/api/indicators/convection', async (_req, res) => {
  try { res.json(await convectionService.getAllSignals()); } catch { res.json([]); }
});

app.get('/api/indicators/tidal', async (_req, res) => {
  try { res.json(await tidalService.getAllSignals()); } catch { res.json([]); }
});

app.get('/api/indicators/sst', async (_req, res) => {
  try { res.json(await sstService.getAllSignals()); } catch { res.json([]); }
});

app.get('/api/indicators/radiosonde', async (_req, res) => {
  try { res.json(await radiosondeService.getAllSignals()); } catch { res.json([]); }
});

app.get('/api/indicators/soil', async (_req, res) => {
  try { res.json(await soilMoistureService.getAllSignals()); } catch { res.json([]); }
});

app.get('/api/indicators/all', async (_req, res) => {
  try {
    const [buoys, flights, streams, solar, power, faa, convection, tidal, sst, radiosonde, soil] = await Promise.all([
      buoyService.getAllSignals().catch(() => []),
      flightService.getAllStatuses().catch(() => []),
      streamService.getAllSignals().catch(() => []),
      solarService.getSolarSignal().catch(() => null),
      powerService.getSignals().catch(() => []),
      faaService.getAllSignals().catch(() => []),
      convectionService.getAllSignals().catch(() => []),
      tidalService.getAllSignals().catch(() => []),
      sstService.getAllSignals().catch(() => []),
      radiosondeService.getAllSignals().catch(() => []),
      soilMoistureService.getAllSignals().catch(() => []),
    ]);
    res.json({ buoys, flights, streams, solar, power, faa, convection, tidal, sst, radiosonde, soil });
  } catch { res.json({ buoys: [], flights: [], streams: [], solar: null, power: [], faa: [], convection: [], tidal: [], sst: [], radiosonde: [], soil: [] }); }
});

// ─── Tomorrow.io High-Res Weather API ─────────────────────────────────────

app.get('/api/weather/tomorrow', async (_req, res) => {
  try {
    const forecasts = await tomorrowService.getAllForecasts();
    res.json({
      hasApiKey: tomorrowService.hasApiKey(),
      remaining: tomorrowService.getRemainingRequests(),
      forecasts,
    });
  } catch { res.json({ hasApiKey: false, remaining: { daily: 0, hourly: 0 }, forecasts: [] }); }
});

app.get('/api/weather/tomorrow/:city', async (req, res) => {
  try {
    const location = WEATHER_LOCATIONS.find(l => l.name === req.params.city);
    if (!location) { res.status(404).json({ error: 'City not found' }); return; }
    const forecast = await tomorrowService.getForecast(location);
    res.json(forecast);
  } catch { res.json({ error: 'fetch failed' }); }
});

// ─── Radar Screenshot API ─────────────────────────────────────────────────

// Serve radar/satellite screenshot images
app.get('/api/radar/image/:filename', (req, res) => {
  try {
    const filePath = path.join(radarService.getScreenshotDir(), req.params.filename);
    if (!fs.existsSync(filePath)) { res.status(404).send('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.send(fs.readFileSync(filePath));
  } catch { res.status(500).send('Error'); }
});

// Capture radar for a specific city
app.get('/api/radar/capture/:city', async (req, res) => {
  try {
    const location = WEATHER_LOCATIONS.find(l => l.name === req.params.city);
    if (!location) { res.status(404).json({ error: 'City not found' }); return; }
    const snapshot = await radarService.captureCity(location);
    res.json({
      city: snapshot.cityName,
      timestamp: snapshot.timestamp,
      summary: snapshot.summary,
      screenshots: snapshot.screenshots.map(s => ({
        zoom: s.zoomLevel,
        url: s.imageUrl,
        analysis: s.analysis,
      })),
      satellite: snapshot.satellite ? {
        url: snapshot.satellite.imageUrl,
        cloudPct: snapshot.satellite.cloudCoveragePct,
      } : null,
    });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// Capture all cities
let cachedRadarSnapshots: any[] = [];
let lastRadarCapture = 0;
const RADAR_CAPTURE_INTERVAL = 5 * 60 * 1000; // 5 min

app.get('/api/radar/all', async (_req, res) => {
  try {
    if (Date.now() - lastRadarCapture < RADAR_CAPTURE_INTERVAL && cachedRadarSnapshots.length > 0) {
      res.json(cachedRadarSnapshots);
      return;
    }

    const snapshots = await radarService.captureAllCities();
    cachedRadarSnapshots = snapshots.map(s => ({
      city: s.cityName,
      timestamp: s.timestamp,
      summary: s.summary,
      screenshots: s.screenshots.map(sc => ({
        zoom: sc.zoomLevel,
        url: sc.imageUrl,
        analysis: sc.analysis,
      })),
      satellite: s.satellite ? {
        url: s.satellite.imageUrl,
        cloudPct: s.satellite.cloudCoveragePct,
      } : null,
    }));
    lastRadarCapture = Date.now();
    res.json(cachedRadarSnapshots);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// List saved screenshots
app.get('/api/radar/screenshots', (_req, res) => {
  try {
    const files = radarService.listScreenshots();
    res.json(files.map(f => ({ filename: f, url: `/api/radar/image/${f}` })));
  } catch { res.json([]); }
});

// Auto-capture radar every 5 minutes
setInterval(async () => {
  try {
    const snapshots = await radarService.captureAllCities();
    cachedRadarSnapshots = snapshots.map(s => ({
      city: s.cityName, timestamp: s.timestamp, summary: s.summary,
      screenshots: s.screenshots.map(sc => ({ zoom: sc.zoomLevel, url: sc.imageUrl, analysis: sc.analysis })),
      satellite: s.satellite ? { url: s.satellite.imageUrl, cloudPct: s.satellite.cloudCoveragePct } : null,
    }));
    lastRadarCapture = Date.now();
    console.log(`[Radar] Captured ${snapshots.length} cities, ${snapshots.reduce((s, c) => s + c.screenshots.length, 0)} screenshots`);
  } catch (e) { console.error(`[Radar] Auto-capture error: ${(e as Error).message}`); }
}, RADAR_CAPTURE_INTERVAL);

// Initial radar capture (delayed)
setTimeout(async () => {
  try {
    const snapshots = await radarService.captureAllCities();
    cachedRadarSnapshots = snapshots.map(s => ({
      city: s.cityName, timestamp: s.timestamp, summary: s.summary,
      screenshots: s.screenshots.map(sc => ({ zoom: sc.zoomLevel, url: sc.imageUrl, analysis: sc.analysis })),
      satellite: s.satellite ? { url: s.satellite.imageUrl, cloudPct: s.satellite.cloudCoveragePct } : null,
    }));
    lastRadarCapture = Date.now();
    console.log(`[Radar] Initial capture: ${snapshots.length} cities`);
  } catch (e) { console.error(`[Radar] Initial capture error: ${(e as Error).message}`); }
}, 10000);

app.get('/api/weather/stats', (_req, res) => {
  try {
    const ticks = (db.prepare('SELECT COUNT(*) as n FROM weather_price_ticks').get() as any)?.n || 0;
    const forecasts = (db.prepare('SELECT COUNT(*) as n FROM weather_forecasts').get() as any)?.n || 0;
    const resolutions = (db.prepare('SELECT COUNT(*) as n FROM weather_resolutions').get() as any)?.n || 0;

    const accuracy = db.prepare(`
      SELECT
        SUM(market_was_right) as market_right,
        SUM(model_was_right) as model_right,
        COUNT(*) as total,
        SUM(profit_if_traded) as hypothetical_pnl
      FROM weather_resolutions
    `).get() as any;

    const cities = db.prepare(`
      SELECT location, COUNT(DISTINCT target_date) as dates,
             COUNT(*) as ticks
      FROM weather_price_ticks GROUP BY location ORDER BY ticks DESC
    `).all();

    const calibration = db.prepare(`
      SELECT location, COUNT(*) as n,
             ROUND(AVG(forecast_error_f), 2) as bias,
             ROUND(AVG(ABS(forecast_error_f)), 2) as mae
      FROM weather_forecasts WHERE forecast_error_f IS NOT NULL
      GROUP BY location ORDER BY n DESC
    `).all();

    res.json({
      ticks, forecasts, resolutions,
      accuracy: accuracy?.total > 0 ? {
        marketPct: Math.round((accuracy.market_right / accuracy.total) * 1000) / 10,
        modelPct: accuracy.model_right != null ? Math.round((accuracy.model_right / accuracy.total) * 1000) / 10 : null,
        hypotheticalPnl: Math.round((accuracy.hypothetical_pnl || 0) * 100) / 100,
      } : null,
      cities,
      calibration,
    });
  } catch { res.json({}); }
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

  // Merge weather edges as LiveMarket entries
  const weatherMarkets: LiveMarket[] = cachedWeatherEdges.slice(0, 20).map(e => ({
    id: `weather-${e.location}-${e.targetDate}-${e.temperatureC}`,
    platform: 'Polymarket',
    asset: `TEMP-${e.location}`,
    title: `${e.side} ${e.outcome} in ${e.location} (${e.targetDate}) | E[$${e.expectedProfit}]`,
    logo: '',
    yesPrice: e.marketPrice / 100,
    noPrice: 1 - e.marketPrice / 100,
    volume: `$${e.expectedProfit} exp`,
    secondsToExpiry: e.hoursOut * 3600,
    tags: ['weather', 'temperature'],
    category: 'weather',
    confidence: e.confidence === 'HIGH' ? 'LOCK' : e.confidence === 'MEDIUM' ? 'HAMMER' : 'GOOD',
    urgency: e.hoursOut < 6 ? 'HIGH' : 'NORMAL',
  }));

  return [...limitless, ...cryptoCom, ...weatherMarkets].sort((a, b) => a.secondsToExpiry - b.secondsToExpiry);
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

// Push weather edges every 60s
setInterval(async () => {
  try {
    const edges = await scanWeatherEdges();
    broadcast('WEATHER', edges);
  } catch { /* continue */ }
}, 60000);

// Initial weather scan on startup (delayed to not block)
setTimeout(() => scanWeatherEdges().catch(() => {}), 5000);

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
      <div class="tab" data-tab="tracking">Tracking</div>
      <div class="tab" data-tab="calibration">Calibration</div>
      <div class="tab active" data-tab="weather">Weather</div>
      <div class="tab" data-tab="trades">Trades</div>
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
const state = { markets: [], weatherEdges: [], tab: 'weather', leftView: 'sites', logs: [], platformWallets: {}, engine: null };

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
  if (msg.type === 'WEATHER') {
    state.weatherEdges = msg.data;
    if (state.tab === 'weather') renderWeather();
    addLog('Weather scan: ' + msg.data.length + ' edges');
  }
  if (msg.type === 'ENGINE_STATE') {
    state.engine = msg.data;
    if (state.tab === 'trades') renderTrades();
    // Update wallet panel with live engine data
    if (msg.data.balance) {
      const avail = document.getElementById('w-available');
      if (avail) avail.textContent = msg.data.balance.toFixed(2);
    }
    if (msg.data.deployed !== undefined) {
      const dep = document.getElementById('w-deployed');
      if (dep) dep.textContent = '$' + msg.data.deployed.toFixed(2);
    }
    if (msg.data.tradesExecuted !== undefined) {
      const tr = document.getElementById('w-trades');
      if (tr) tr.textContent = msg.data.tradesExecuted;
    }
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
  else if (state.tab === 'weather') renderWeather();
  else if (state.tab === 'trades') renderTrades();
  else if (state.tab === 'agent') fetchAgent();
  else if (state.tab === 'log') renderLog();
}

async function renderTrades() {
  const el = document.getElementById('terminal');
  if (!el) return;

  // Fetch engine state if not yet loaded
  let eng = state.engine;
  if (!eng) {
    try {
      eng = await (await fetch('/api/engine/state')).json();
      state.engine = eng;
    } catch { eng = null; }
  }

  if (!eng) {
    el.innerHTML = '<div style="padding:20px;color:var(--dim)">Engine not running. Starting...</div>';
    return;
  }

  const statusColor = eng.status === 'IDLE' ? 'var(--green)' : eng.status === 'ERROR' ? 'var(--red)' : 'var(--yellow)';
  const lastScanAgo = eng.lastScan ? Math.round((Date.now() - eng.lastScan) / 1000) + 's ago' : 'never';

  let html = '<div style="padding:16px;">';

  // Engine status bar
  html += '<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:6px;">';
  html += '<div style="display:flex;align-items:center;gap:8px;"><div style="width:10px;height:10px;border-radius:50%;background:' + statusColor + ';"></div><span style="color:' + statusColor + ';font-weight:bold;">' + eng.status + '</span></div>';
  html += '<span style="color:var(--dim)">Scan #' + (eng.scanCount || 0) + ' | Last: ' + lastScanAgo + '</span>';
  html += '<span style="color:var(--green);font-weight:bold;">Balance: $' + (eng.balance || 0).toFixed(2) + '</span>';
  html += '<span style="color:var(--yellow);">Deployed: $' + (eng.deployed || 0).toFixed(2) + '</span>';
  html += '<span style="color:var(--dim)">Remaining: $' + (eng.bankrollRemaining || 0).toFixed(2) + '</span>';
  html += '<span style="color:var(--dim)">Markets: ' + (eng.marketCount || 0) + '</span>';
  html += '<span style="color:var(--cyan)">Edges: ' + (eng.edgeCount || 0) + '</span>';
  html += '</div>';

  // Action buttons
  html += '<div style="display:flex;gap:8px;margin-bottom:16px;">';
  html += '<button onclick="executeNow()" style="padding:8px 16px;background:var(--green);color:#000;border:none;border-radius:4px;cursor:pointer;font-family:inherit;font-weight:bold;">Execute Best Edges</button>';
  html += '<button onclick="toggleAutoExec()" style="padding:8px 16px;background:var(--bg3);color:var(--fg);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-family:inherit;">Toggle Auto-Execute</button>';
  html += '<button onclick="renderTrades()" style="padding:8px 16px;background:var(--bg3);color:var(--fg);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-family:inherit;">Refresh</button>';
  html += '</div>';

  // Top edges table
  const edges = eng.topEdges || eng.edges || [];
  if (edges.length > 0) {
    html += '<div style="margin-bottom:16px;"><span style="color:var(--cyan);font-weight:bold;">LIVE EDGES</span></div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:var(--bg2);color:var(--dim);">';
    html += '<th style="padding:6px 8px;text-align:left;">Direction</th>';
    html += '<th style="padding:6px 8px;text-align:left;">Outcome</th>';
    html += '<th style="padding:6px 8px;text-align:left;">City</th>';
    html += '<th style="padding:6px 8px;text-align:left;">Date</th>';
    html += '<th style="padding:6px 8px;text-align:right;">Model</th>';
    html += '<th style="padding:6px 8px;text-align:right;">Market</th>';
    html += '<th style="padding:6px 8px;text-align:right;">Edge</th>';
    html += '<th style="padding:6px 8px;text-align:right;">E[Profit]</th>';
    html += '<th style="padding:6px 8px;text-align:center;">Conf</th>';
    html += '</tr></thead><tbody>';

    for (const e of edges.slice(0, 15)) {
      const edgeCents = (e.edge * 100).toFixed(1);
      const edgeColor = Math.abs(e.edge) > 0.30 ? 'var(--green)' : Math.abs(e.edge) > 0.15 ? 'var(--yellow)' : 'var(--dim)';
      const confColor = e.confidence === 'HIGH' ? 'var(--green)' : e.confidence === 'MEDIUM' ? 'var(--yellow)' : 'var(--dim)';
      html += '<tr style="border-bottom:1px solid var(--border);">';
      html += '<td style="padding:6px 8px;color:' + (e.direction === 'BUY_YES' ? 'var(--green)' : 'var(--red)') + ';">' + e.direction + '</td>';
      html += '<td style="padding:6px 8px;">' + e.outcome + '</td>';
      html += '<td style="padding:6px 8px;">' + e.location + '</td>';
      html += '<td style="padding:6px 8px;">' + (e.targetDate || '').slice(5) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;">' + ((e.modelProb || e.modelProbability) * 100).toFixed(1) + '%</td>';
      html += '<td style="padding:6px 8px;text-align:right;">' + (e.marketPrice * 100).toFixed(1) + '%</td>';
      html += '<td style="padding:6px 8px;text-align:right;color:' + edgeColor + ';">' + edgeCents + 'c</td>';
      html += '<td style="padding:6px 8px;text-align:right;color:var(--green);">$' + (e.expectedProfit || 0).toFixed(2) + '</td>';
      html += '<td style="padding:6px 8px;text-align:center;color:' + confColor + ';">' + (e.confidence || 'LOW') + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  }

  // Trade history
  const trades = eng.trades || [];
  if (trades.length > 0) {
    html += '<div style="margin:16px 0 8px;"><span style="color:var(--yellow);font-weight:bold;">TRADE HISTORY (' + trades.length + ')</span></div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:var(--bg2);color:var(--dim);">';
    html += '<th style="padding:6px 8px;text-align:left;">Time</th>';
    html += '<th style="padding:6px 8px;text-align:left;">Status</th>';
    html += '<th style="padding:6px 8px;text-align:left;">Trade</th>';
    html += '<th style="padding:6px 8px;text-align:left;">City</th>';
    html += '<th style="padding:6px 8px;text-align:right;">Price</th>';
    html += '<th style="padding:6px 8px;text-align:right;">Shares</th>';
    html += '<th style="padding:6px 8px;text-align:right;">Cost</th>';
    html += '<th style="padding:6px 8px;text-align:right;">Edge</th>';
    html += '</tr></thead><tbody>';

    for (const t of [...trades].reverse().slice(0, 20)) {
      const time = new Date(t.timestamp).toLocaleTimeString();
      const statusColor = t.status === 'FILLED' ? 'var(--green)' : t.status === 'PLACED' ? 'var(--cyan)' : t.status === 'FAILED' ? 'var(--red)' : 'var(--dim)';
      html += '<tr style="border-bottom:1px solid var(--border);">';
      html += '<td style="padding:6px 8px;color:var(--dim);">' + time + '</td>';
      html += '<td style="padding:6px 8px;color:' + statusColor + ';">' + t.status + '</td>';
      html += '<td style="padding:6px 8px;">' + t.direction + ' ' + t.outcome + '</td>';
      html += '<td style="padding:6px 8px;">' + t.location + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;">$' + (t.price || 0).toFixed(2) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;">' + (t.shares || 0) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;color:var(--yellow);">$' + (t.costUsdc || 0).toFixed(2) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;">' + ((t.edge || 0) * 100).toFixed(1) + 'c</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
  } else {
    html += '<div style="margin-top:16px;color:var(--dim);">No trades yet. Click "Execute Best Edges" or enable auto-execute.</div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

async function executeNow() {
  addLog('Executing best edges...');
  try {
    const r = await fetch('/api/engine/execute', { method: 'POST' });
    const data = await r.json();
    if (data.success) {
      addLog('Executed ' + data.trades + ' trades');
    } else {
      addLog('Execution failed: ' + data.error);
    }
    renderTrades();
  } catch(e) { addLog('Execute error: ' + e.message); }
}

async function toggleAutoExec() {
  const current = state.engine?.autoExecute || false;
  try {
    const r = await fetch('/api/engine/toggle-auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !current }),
    });
    const data = await r.json();
    addLog('Auto-execute: ' + (data.autoExecute ? 'ON' : 'OFF'));
    if (state.engine) state.engine.autoExecute = data.autoExecute;
    renderTrades();
  } catch(e) { addLog('Toggle error: ' + e.message); }
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

async function renderWeather() {
  const el = document.getElementById('terminal');
  let html = '';

  // Fetch all data in parallel
  var edgesP = state.weatherEdges.length > 0 ? Promise.resolve(state.weatherEdges) : fetch('/api/weather/edges').then(function(r){return r.json()}).catch(function(){return []});
  var enhP = fetch('/api/weather/enhanced').then(function(r){return r.json()}).catch(function(){return {}});
  var moversP = fetch('/api/weather/movers').then(function(r){return r.json()}).catch(function(){return []});
  var upstreamP = fetch('/api/weather/upstream').then(function(r){return r.json()}).catch(function(){return []});
  var statsP = fetch('/api/weather/stats').then(function(r){return r.json()}).catch(function(){return {}});
  // Pre-warm cross-platform caches
  fetch('/api/weather/kalshi').catch(function(){});
  fetch('/api/weather/manifold').catch(function(){});

  var results = await Promise.all([edgesP, enhP, moversP, upstreamP, statsP]);
  var edges = results[0]; state.weatherEdges = edges;
  var enhanced = results[1];
  var movers = results[2];
  var upstream = results[3];
  var stats = results[4];
  var enhCities = Object.keys(enhanced);
  var currentHour = new Date().getHours();

  // ─── DATA SOURCES STATUS BAR ───
  var srcCount = 0;
  var srcList = [];
  if (enhCities.length > 0 && enhanced[enhCities[0]].multiModel) { srcCount++; srcList.push('Multi-Model(5)'); }
  if (enhCities.length > 0 && enhanced[enhCities[0]].groundTruth) { srcCount++; srcList.push('METAR'); }
  if (enhCities.length > 0 && enhanced[enhCities[0]].hazards) { srcCount += 3; srcList.push('Satellite'); srcList.push('Radar'); srcList.push('Lightning'); }
  if (enhCities.some(function(c){return enhanced[c].trajectory})) { srcCount++; srcList.push('ASOS-1min'); }
  srcList.push('Wind-Sentinel'); srcCount++;
  srcList.push('NOAA/NWS'); srcCount++;
  srcList.push('Kalshi'); srcCount++;
  srcList.push('Manifold'); srcCount++;
  srcList.push('NEXRAD'); srcCount++;
  srcList.push('Blitzortung'); srcCount++;
  srcList.push('Movebank'); srcCount++;
  srcList.push('eBird'); srcCount++;
  srcList.push('Tomorrow.io'); srcCount++;
  srcList.push('iNaturalist'); srcCount++;
  srcList.push('OBIS-Marine'); srcCount++;
  srcList.push('NOAA-Buoys'); srcCount++;
  srcList.push('OpenSky'); srcCount++;
  srcList.push('USGS-Streams'); srcCount++;
  srcList.push('Solar/Kp'); srcCount++;
  srcList.push('NYISO-Grid'); srcCount++;
  srcList.push('FAA-Status'); srcCount++;
  srcList.push('CAPE/AQI'); srcCount++;
  srcList.push('CO-OPS-Tidal'); srcCount++;
  srcList.push('ERDDAP-SST'); srcCount++;
  srcList.push('Radiosonde'); srcCount++;
  srcList.push('NASA-Soil'); srcCount++;

  html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.2);border-radius:6px;margin-bottom:12px">';
  html += '<span style="color:var(--green);font-weight:bold;font-size:14px">WEATHER INTELLIGENCE</span>';
  html += '<span class="dim">|</span>';
  html += '<span class="cyan">' + srcCount + ' data sources active</span>';
  html += '<span class="dim">|</span>';
  srcList.forEach(function(s) {
    html += '<span style="background:rgba(0,255,136,0.15);color:var(--green);padding:2px 6px;border-radius:3px;font-size:11px;margin-right:4px">' + s + '</span>';
  });
  html += '<span style="margin-left:auto;color:var(--dim);font-size:11px">' + new Date().toLocaleTimeString() + '</span>';
  html += '</div>';

  // ─── LIVE CITY OVERVIEW — The main attraction ───
  if (enhCities.length > 0) {
    html += '<div class="terminal-line header-line" style="color:var(--cyan);font-size:13px;margin-bottom:4px">LIVE CITY WEATHER OVERVIEW</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;margin-bottom:16px">';

    enhCities.forEach(function(city) {
      var d = enhanced[city];
      var mm = d.multiModel;
      var hz = d.hazards;
      var gt = d.groundTruth;
      var tj = d.trajectory;

      var borderColor = mm ? (mm.agreement === 'STRONG' ? 'rgba(0,255,136,0.3)' : mm.agreement === 'MODERATE' ? 'rgba(255,255,0,0.3)' : 'rgba(255,85,85,0.3)') : 'rgba(255,255,255,0.1)';
      var currentTemp = gt ? gt.currentTempF : (tj ? tj.currentTempF : null);

      html += '<div style="background:rgba(255,255,255,0.03);border:1px solid ' + borderColor + ';border-radius:6px;padding:10px">';

      // City header with current temp
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
      html += '<span style="color:var(--cyan);font-weight:bold;font-size:13px">' + esc(city) + '</span>';
      if (currentTemp) {
        html += '<span style="font-size:20px;font-weight:bold;color:var(--white)">' + currentTemp + '<span style="font-size:12px;color:var(--dim)">F</span></span>';
      }
      html += '</div>';

      // Model consensus bar
      if (mm && mm.models.length > 0) {
        var minTemp = Math.min.apply(null, mm.models.map(function(m){return m.highF}));
        var maxTemp = Math.max.apply(null, mm.models.map(function(m){return m.highF}));
        var range = maxTemp - minTemp || 1;

        html += '<div style="margin-bottom:6px">';
        html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--dim);margin-bottom:2px"><span>Model Forecasts (spread ' + mm.spreadF.toFixed(1) + 'F)</span><span style="color:' + (mm.agreement === 'STRONG' ? 'var(--green)' : mm.agreement === 'MODERATE' ? 'var(--yellow)' : 'var(--red)') + '">' + mm.agreement + '</span></div>';
        html += '<div style="position:relative;height:20px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden">';
        mm.models.forEach(function(m, i) {
          var pct = ((m.highF - minTemp) / range) * 80 + 10;
          var colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#9b59b6'];
          html += '<div style="position:absolute;left:' + pct + '%;top:2px;width:2px;height:16px;background:' + colors[i % 5] + ';border-radius:1px" title="' + m.name + ': ' + m.highF + 'F"></div>';
          html += '<div style="position:absolute;left:' + (pct - 8) + '%;top:3px;font-size:8px;color:' + colors[i % 5] + '">' + m.name.split(' ')[0].substring(0,3) + '</div>';
        });
        // Best estimate marker
        var bestPct = ((mm.bestEstimateF - minTemp) / range) * 80 + 10;
        html += '<div style="position:absolute;left:' + bestPct + '%;top:0;width:3px;height:20px;background:var(--white);border-radius:1px" title="Best: ' + mm.bestEstimateF + 'F"></div>';
        html += '</div>';
        html += '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:1px"><span>' + minTemp.toFixed(0) + 'F</span><span style="color:var(--white)">Best: ' + mm.bestEstimateF.toFixed(1) + 'F</span><span>' + maxTemp.toFixed(0) + 'F</span></div>';
        html += '</div>';
      }

      // Status row: cloud, rain, storm, METAR
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px">';
      if (hz) {
        var cloudIcon = hz.cloudPct > 75 ? 'OVC' : hz.cloudPct > 50 ? 'BKN' : hz.cloudPct > 25 ? 'SCT' : 'CLR';
        var cloudColor = hz.cloudPct > 75 ? 'var(--dim)' : hz.cloudPct > 50 ? 'var(--yellow)' : 'var(--cyan)';
        html += '<span style="color:' + cloudColor + '">' + cloudIcon + ' ' + hz.cloudPct + '%</span>';
        html += '<span style="color:' + (hz.cloudTrend === 'CLEARING' ? 'var(--green)' : hz.cloudTrend === 'BUILDING' ? 'var(--red)' : 'var(--dim)') + '">' + hz.cloudTrend + '</span>';

        if (hz.isRaining) {
          html += '<span style="color:var(--blue);font-weight:bold">RAIN ' + hz.precipTrend + '</span>';
        }
        if (hz.stormRisk !== 'NONE') {
          var sColor = hz.stormRisk === 'LOW' ? 'var(--yellow)' : 'var(--red)';
          html += '<span style="color:' + sColor + ';font-weight:bold">STORM:' + hz.stormRisk + '</span>';
        }
        if (hz.cloudDivergence !== 0) {
          html += '<span style="color:' + (Math.abs(hz.cloudDivergence) > 15 ? 'var(--yellow)' : 'var(--dim)') + '">div:' + (hz.cloudDivergence > 0 ? '+' : '') + hz.cloudDivergence + '%</span>';
        }
      }
      if (gt) {
        var divColor = Math.abs(gt.divergenceF) > 3 ? 'var(--red)' : Math.abs(gt.divergenceF) > 1.5 ? 'var(--yellow)' : 'var(--green)';
        var divLabel = gt.likelyOvershoot ? 'HOT' : gt.likelyUndershoot ? 'COLD' : 'OK';
        html += '<span style="color:' + divColor + '">METAR:' + (gt.divergenceF > 0 ? '+' : '') + gt.divergenceF + 'F (' + divLabel + ')</span>';
      }
      html += '</div>';

      // Trajectory if available
      if (tj) {
        var trajColor = tj.trajectory.includes('WARMING') ? 'var(--red)' : tj.trajectory.includes('COOLING') ? 'var(--cyan)' : 'var(--yellow)';
        html += '<div style="margin-top:4px;font-size:10px">';
        html += '<span style="color:' + trajColor + ';font-weight:bold">' + tj.trajectory + '</span>';
        html += ' <span class="dim">' + tj.rate5min.toFixed(3) + 'F/min</span>';
        if (tj.peakDetected) {
          html += ' <span style="color:var(--green);font-weight:bold">PEAK: ' + tj.estimatedPeakF + 'F</span>';
        }
        html += '</div>';
      }

      html += '</div>'; // card
    });
    html += '</div>'; // grid
  }

  // ─── ACTIONABLE EDGES TABLE ───
  html += '<div class="terminal-line header-line" style="color:var(--green);font-size:13px">ACTIONABLE EDGES — Forecast vs Market Mispricing</div>';

  if (edges.length === 0) {
    html += '<div class="terminal-line dim" style="text-align:center;padding:16px">No edges found. Bot scanning every 60s...</div>';
  } else {
    var totalProfit = edges.reduce(function(s, e) { return s + e.expectedProfit; }, 0);
    var highConf = edges.filter(function(e) { return e.confidence === 'HIGH'; });
    var edgeCities = [];
    edges.forEach(function(e) { if (edgeCities.indexOf(e.location) === -1) edgeCities.push(e.location); });

    html += '<div class="terminal-line" style="margin-bottom:6px">Cities: <span class="cyan">' + edgeCities.length + '</span> | Edges: <span class="green">' + edges.length + '</span> | E[Profit]: <span class="green" style="font-weight:bold">$' + totalProfit.toFixed(0) + '</span> | HIGH: <span class="yellow">' + highConf.length + '</span></div>';

    html += '<table class="tracking-table"><thead><tr>' +
      '<th>City</th><th>Date</th><th>Outcome</th><th>Side</th><th>Forecast</th><th>Market</th><th>Edge</th><th>E[Profit]</th><th>Size</th><th>Conf</th>' +
      '</tr></thead><tbody>';

    edges.forEach(function(e) {
      var cls = e.confidence === 'HIGH' ? 'green' : e.confidence === 'MEDIUM' ? 'yellow' : 'cyan';
      var edgeColor = e.edge > 0 ? 'var(--green)' : 'var(--red)';
      html += '<tr>' +
        '<td>' + esc(e.location) + '</td>' +
        '<td>' + e.targetDate.slice(5) + '</td>' +
        '<td>' + esc(e.outcome) + '</td>' +
        '<td style="color:' + (e.side === 'BUY' ? 'var(--green)' : 'var(--red)') + ';font-weight:bold">' + e.side + '</td>' +
        '<td>' + e.forecastProb + '%</td>' +
        '<td>' + e.marketPrice + '%</td>' +
        '<td style="color:' + edgeColor + '">' + (e.edge > 0 ? '+' : '') + e.edge + 'c</td>' +
        '<td class="green" style="font-weight:bold">$' + e.expectedProfit.toFixed(0) + '</td>' +
        '<td>$' + e.size.toFixed(0) + '</td>' +
        '<td><span class="badge ' + cls + '">' + e.confidence + '</span></td>' +
      '</tr>';
    });
    html += '</tbody></table>';
  }

  // ─── TWO-COLUMN: MARKET MOVERS + UPSTREAM ALERTS ───
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">';

  // Left: Market Movers
  html += '<div>';
  html += '<div class="terminal-line header-line" style="color:var(--yellow);font-size:12px">MARKET MOVE TIMELINE</div>';
  if (movers && movers.length > 0) {
    // Next move callout
    var nextMover = movers.find(function(m) { return m.triggerHour > currentHour; });
    if (nextMover) {
      html += '<div style="padding:6px 10px;border:1px solid var(--yellow);border-radius:4px;margin-bottom:6px;font-size:11px">';
      html += '<span class="yellow" style="font-weight:bold">NEXT:</span> ';
      html += '<span class="cyan">' + nextMover.location + '</span> ' + String(nextMover.triggerHour).padStart(2,'0') + ':00 — ' + nextMover.type.replace(/_/g,' ');
      html += '</div>';
    }

    html += '<table class="tracking-table" style="font-size:11px"><thead><tr><th>Time</th><th>City</th><th>Event</th><th>Dir</th><th>Impact</th></tr></thead><tbody>';
    var mCount = 0;
    movers.forEach(function(m) {
      if (mCount >= 12) return;
      var isPast = m.triggerHour < currentHour;
      var isNow = m.triggerHour === currentHour;
      var marker = isNow ? ' style="background:rgba(255,255,0,0.1);font-weight:bold"' : isPast ? ' style="opacity:0.4"' : '';
      var dirColor = m.direction === 'WARMER' ? 'var(--red)' : m.direction === 'COOLER' ? 'var(--cyan)' : 'var(--yellow)';
      var impactStr = m.impactF > 0 ? (m.direction === 'WARMER' ? '+' : '-') + m.impactF.toFixed(1) + 'F' : '-';
      html += '<tr' + marker + '><td>' + (isNow ? '>' : '') + String(m.triggerHour).padStart(2,'0') + ':00</td><td>' + esc(m.location) + '</td><td>' + m.type.replace(/_/g,' ') + '</td><td style="color:' + dirColor + '">' + m.direction + '</td><td>' + impactStr + '</td></tr>';
      mCount++;
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="terminal-line dim" style="font-size:11px">No upcoming market movers detected</div>';
  }
  html += '</div>';

  // Right: Upstream Wind Alerts
  html += '<div>';
  html += '<div class="terminal-line header-line" style="color:var(--magenta);font-size:12px">UPSTREAM WIND ALERTS</div>';
  if (upstream && upstream.length > 0) {
    // Top alert callout
    var urgent = upstream[0];
    html += '<div style="padding:6px 10px;border:1px solid var(--magenta);border-radius:4px;margin-bottom:6px;font-size:11px">';
    html += '<span style="color:var(--magenta);font-weight:bold">TOP:</span> ' + esc(urgent.description).substring(0, 120);
    html += '</div>';

    html += '<table class="tracking-table" style="font-size:11px"><thead><tr><th>Target</th><th>Sentinel</th><th>Dist</th><th>Dir</th><th>Arrives</th><th>Impact</th></tr></thead><tbody>';
    upstream.slice(0, 8).forEach(function(a) {
      var dirColor = a.direction === 'WARMER' ? 'var(--red)' : a.direction === 'COOLER' ? 'var(--cyan)' : a.direction === 'CLEARING' ? 'var(--yellow)' : 'var(--blue)';
      var arrStr = a.arrivalHours < 1 ? Math.round(a.arrivalHours * 60) + 'm' : a.arrivalHours.toFixed(1) + 'h';
      html += '<tr><td class="cyan">' + esc(a.targetCity) + '</td><td>' + esc(a.sentinel) + '</td><td>' + a.distanceKm + 'km</td><td style="color:' + dirColor + '">' + a.direction + '</td><td style="font-weight:bold">' + arrStr + '</td><td>' + (a.impactF > 0 ? a.impactF.toFixed(1) + 'F' : '-') + '</td></tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div class="terminal-line dim" style="font-size:11px">No upstream alerts — calm conditions</div>';
  }
  html += '</div>';
  html += '</div>'; // two-column grid

  // ─── MODEL COMPARISON TABLE ───
  if (enhCities.length > 0 && enhanced[enhCities[0]].multiModel) {
    html += '<div style="margin-top:16px"></div>';
    html += '<div class="terminal-line header-line" style="color:var(--green);font-size:12px">MULTI-MODEL FORECAST COMPARISON</div>';
    html += '<table class="tracking-table" style="font-size:11px"><thead><tr><th>City</th><th>ECMWF</th><th>ICON</th><th>GFS</th><th>GEM</th><th>JMA</th><th>Spread</th><th>Best Est.</th><th>95% CI</th><th>Agreement</th></tr></thead><tbody>';

    enhCities.forEach(function(city) {
      var mm = enhanced[city].multiModel;
      if (!mm) return;
      var agrColor = mm.agreement === 'STRONG' ? 'var(--green)' : mm.agreement === 'MODERATE' ? 'var(--yellow)' : 'var(--red)';

      html += '<tr><td class="cyan">' + esc(city) + '</td>';
      // Show each model temp — find by name
      var modelNames = ['ECMWF IFS','ICON','GFS','GEM','JMA'];
      modelNames.forEach(function(name) {
        var found = mm.models.find(function(m) { return m.name === name; });
        html += '<td>' + (found ? found.highF.toFixed(1) : '-') + '</td>';
      });
      html += '<td style="color:' + (mm.spreadF < 3 ? 'var(--green)' : mm.spreadF < 6 ? 'var(--yellow)' : 'var(--red)') + '">' + mm.spreadF.toFixed(1) + 'F</td>';
      html += '<td style="font-weight:bold">' + mm.bestEstimateF.toFixed(1) + 'F</td>';
      html += '<td>' + mm.ci.low.toFixed(0) + '-' + mm.ci.high.toFixed(0) + 'F</td>';
      html += '<td style="color:' + agrColor + ';font-weight:bold">' + mm.agreement + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  }

  // ─── CROSS-PLATFORM EDGE FINDER ───
  try {
    var edgeData = await fetch('/api/weather/cross-platform-edges').then(function(r){return r.json()}).catch(function(){return {edges:[],arbitrage:[],summary:{totalEdges:0,totalExpectedProfit:0}}});

    html += '<div style="margin-top:16px"></div>';
    html += '<div class="terminal-line header-line" style="color:var(--green);font-size:14px;font-weight:bold">EDGE FINDER — Model vs Market Pricing (28 Data Sources → Trade Signals)</div>';

    if (edgeData.summary && edgeData.summary.totalEdges > 0) {
      var s = edgeData.summary;
      html += '<div style="display:flex;gap:16px;padding:8px 12px;background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.3);border-radius:6px;margin-bottom:8px;font-size:12px">';
      html += '<span><span class="green" style="font-weight:bold">' + s.totalEdges + '</span> edges found</span>';
      html += '<span>Kalshi: <span class="cyan">' + (s.kalshiEdges || 0) + '</span></span>';
      html += '<span>Polymarket: <span class="cyan">' + (s.polymarketEdges || 0) + '</span></span>';
      if (s.arbitrageOpps > 0) html += '<span style="color:var(--yellow);font-weight:bold">Arb opps: ' + s.arbitrageOpps + '</span>';
      html += '<span style="margin-left:auto;font-weight:bold">Expected profit: <span class="green">$' + s.totalExpectedProfit.toFixed(2) + '</span></span>';
      html += '</div>';

      // Edge table
      html += '<table class="tracking-table" style="font-size:11px"><thead><tr>';
      html += '<th>Platform</th><th>City</th><th>Outcome</th><th>Model Prob</th><th>Market Price</th><th>Edge</th><th>Direction</th><th>Size</th><th>E[Profit]</th><th>Confidence</th><th>Signals</th>';
      html += '</tr></thead><tbody>';

      var topEdges = edgeData.edges.slice(0, 15);
      topEdges.forEach(function(e) {
        var edgeColor = Math.abs(e.edge) > 0.12 ? 'var(--green)' : Math.abs(e.edge) > 0.08 ? 'var(--yellow)' : 'var(--dim)';
        var confColor = e.confidence === 'HIGH' ? 'var(--green)' : e.confidence === 'MEDIUM' ? 'var(--yellow)' : 'var(--dim)';
        var dirColor = e.direction === 'BUY_YES' ? 'var(--green)' : 'var(--red)';
        var platBadge = e.platform === 'kalshi' ? '<span style="color:#ff6464">K</span>' : '<span style="color:#9064ff">P</span>';
        html += '<tr>';
        html += '<td>' + platBadge + '</td>';
        html += '<td class="cyan">' + esc(e.location) + '</td>';
        html += '<td>' + esc(e.outcomeLabel || '') + '</td>';
        html += '<td>' + (e.modelProbability * 100).toFixed(1) + '%</td>';
        html += '<td>' + (e.marketPrice * 100).toFixed(1) + '%</td>';
        html += '<td style="color:' + edgeColor + ';font-weight:bold">' + (e.edge > 0 ? '+' : '') + (e.edge * 100).toFixed(1) + '¢</td>';
        html += '<td style="color:' + dirColor + '">' + e.direction + '</td>';
        html += '<td>$' + (e.recommendedSize || 0).toFixed(0) + '</td>';
        html += '<td class="green" style="font-weight:bold">$' + (e.expectedProfit || 0).toFixed(2) + '</td>';
        html += '<td style="color:' + confColor + '">' + (e.confidence || 'LOW') + '</td>';
        html += '<td style="font-size:9px;color:var(--dim)">' + (e.supportingSignals || []).join(', ') + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';

      // Arbitrage opportunities
      if (edgeData.arbitrage && edgeData.arbitrage.length > 0) {
        html += '<div style="margin-top:8px;padding:8px;background:rgba(255,200,0,0.08);border:1px solid rgba(255,200,0,0.3);border-radius:6px">';
        html += '<div style="color:var(--yellow);font-weight:bold;font-size:12px;margin-bottom:4px">CROSS-PLATFORM ARBITRAGE</div>';
        edgeData.arbitrage.forEach(function(a) {
          html += '<div style="font-size:11px;margin-bottom:2px">';
          html += '<span class="cyan">' + esc(a.location) + '</span> ' + esc(a.description || '') + ' ';
          html += 'Kalshi: ' + (a.kalshiPrice * 100).toFixed(1) + '¢ vs Poly: ' + (a.polymarketPrice * 100).toFixed(1) + '¢ ';
          html += '<span style="color:var(--green)">Δ' + (a.priceDifference * 100).toFixed(1) + '¢</span> ';
          html += 'Buy <span style="font-weight:bold">' + a.buyPlatform + '</span>';
          if (a.isRisklessArb) html += ' <span style="color:var(--green);font-weight:bold">RISKLESS ARB</span>';
          html += '</div>';
        });
        html += '</div>';
      }
    } else {
      html += '<div style="padding:8px;color:var(--dim);font-size:11px">Scanning for edges across Kalshi + Polymarket... (fetching forecasts and market data)</div>';
    }
  } catch {}

  // ─── CROSS-PLATFORM WEATHER MARKETS (Polymarket + Kalshi + Manifold) ───
  try {
    var crossP = await fetch('/api/weather/cross-platform').then(function(r){return r.json()}).catch(function(){return {polymarket:[],kalshi:[],manifold:[]}});
    var kalshiMkts = crossP.kalshi || [];
    var manifoldMkts = crossP.manifold || [];

    html += '<div style="margin-top:16px"></div>';
    html += '<div class="terminal-line header-line" style="color:var(--magenta);font-size:13px">CROSS-PLATFORM WEATHER MARKETS</div>';

    // Platform summary badges
    var polyCount = edges.length;
    html += '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">';
    html += '<span style="background:rgba(130,71,229,0.2);color:#8247e5;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:bold">Polymarket: ' + polyCount + ' edges</span>';
    html += '<span style="background:rgba(0,150,255,0.2);color:#0096ff;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:bold">Kalshi: ' + kalshiMkts.length + ' markets</span>';
    html += '<span style="background:rgba(0,200,100,0.2);color:#00c864;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:bold">Manifold: ' + manifoldMkts.length + ' markets</span>';
    html += '</div>';

    // Kalshi bracket markets table
    if (kalshiMkts.length > 0) {
      html += '<div class="terminal-line header-line" style="color:#0096ff;font-size:12px;margin-top:8px">KALSHI — Regulated Temperature Brackets (Real Money, USD)</div>';
      kalshiMkts.forEach(function(km) {
        html += '<div style="background:rgba(0,150,255,0.05);border:1px solid rgba(0,150,255,0.15);border-radius:6px;padding:8px;margin-bottom:8px">';
        html += '<div style="display:flex;justify-content:space-between;margin-bottom:6px">';
        html += '<span style="color:#0096ff;font-weight:bold">' + esc(km.location) + ' — ' + km.targetDate + '</span>';
        html += '<span class="dim">' + esc(km.title) + '</span>';
        html += '<span class="dim">Vol: $' + km.totalVolume + ' | ' + km.outcomes.length + ' brackets</span>';
        html += '</div>';

        // Show bracket outcomes as a visual bar
        html += '<div style="display:flex;gap:2px;height:28px;align-items:flex-end">';
        km.outcomes.forEach(function(o) {
          var pct = Math.max(2, Math.round(o.yesMid * 100));
          var barH = Math.max(4, pct * 0.28);
          var barColor = o.isFloor ? 'rgba(0,150,255,0.4)' : o.isCeiling ? 'rgba(255,100,100,0.4)' : 'rgba(0,200,100,0.5)';
          html += '<div title="' + esc(o.label) + ': ' + pct + '% ($' + o.volume + ' vol)" style="flex:1;height:' + barH + 'px;background:' + barColor + ';border-radius:2px 2px 0 0;min-width:12px;cursor:help"></div>';
        });
        html += '</div>';

        // Labels row
        html += '<div style="display:flex;gap:2px;font-size:9px;color:var(--dim);margin-top:2px">';
        km.outcomes.forEach(function(o) {
          html += '<div style="flex:1;text-align:center;min-width:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + o.label.replace(/°F/g,'') + '</div>';
        });
        html += '</div>';

        // Top 3 most likely outcomes
        var sorted = km.outcomes.slice().sort(function(a,b){return b.yesMid - a.yesMid});
        html += '<div style="display:flex;gap:8px;margin-top:6px;font-size:11px">';
        html += '<span class="dim">Most likely:</span>';
        sorted.slice(0,3).forEach(function(o,i) {
          var badge = i === 0 ? 'var(--green)' : i === 1 ? 'var(--yellow)' : 'var(--dim)';
          html += '<span style="color:' + badge + '">' + esc(o.label) + ' <span style="font-weight:bold">' + Math.round(o.yesMid * 100) + '%</span></span>';
        });
        html += '</div>';
        html += '</div>';
      });
    }

    // Manifold weather markets table
    if (manifoldMkts.length > 0) {
      html += '<div class="terminal-line header-line" style="color:#00c864;font-size:12px;margin-top:8px">MANIFOLD — Community Weather Predictions (Play Money)</div>';
      html += '<table class="tracking-table" style="font-size:11px"><thead><tr>';
      html += '<th>Question</th><th>Location</th><th>Date</th><th>Type</th><th>Prob</th><th>Volume</th><th>Creator</th>';
      html += '</tr></thead><tbody>';
      manifoldMkts.slice(0,15).forEach(function(mm) {
        var typeColor = mm.marketType === 'TEMPERATURE' ? 'var(--red)' : mm.marketType === 'RAIN' ? 'var(--blue)' : mm.marketType === 'SNOW' ? 'var(--cyan)' : 'var(--dim)';
        var probColor = mm.probability > 0.7 ? 'var(--green)' : mm.probability < 0.3 ? 'var(--red)' : 'var(--yellow)';
        html += '<tr>';
        html += '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="' + esc(mm.url) + '" target="_blank" style="color:var(--cyan);text-decoration:none">' + esc(mm.question.substring(0,60)) + '</a></td>';
        html += '<td>' + esc(mm.location) + '</td>';
        html += '<td>' + (mm.targetDate ? mm.targetDate.slice(5) : '-') + '</td>';
        html += '<td style="color:' + typeColor + '">' + mm.marketType + '</td>';
        html += '<td style="color:' + probColor + ';font-weight:bold">' + Math.round(mm.probability * 100) + '%</td>';
        html += '<td>' + (mm.volume > 1000 ? (mm.volume/1000).toFixed(1) + 'k' : mm.volume) + '</td>';
        html += '<td class="dim">' + esc(mm.creatorName) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    }

    // Cross-platform arbitrage opportunities — compare same-city prices
    if (kalshiMkts.length > 0 && edges.length > 0) {
      var arbOpps = [];
      kalshiMkts.forEach(function(km) {
        var polyEdgesForCity = edges.filter(function(e) { return e.location === km.location && e.targetDate === km.targetDate; });
        if (polyEdgesForCity.length > 0) {
          arbOpps.push({ location: km.location, date: km.targetDate, polyEdges: polyEdgesForCity.length, kalshiBrackets: km.outcomes.length, kalshiVol: km.totalVolume });
        }
      });
      if (arbOpps.length > 0) {
        html += '<div style="margin-top:8px;padding:8px 12px;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);border-radius:6px">';
        html += '<div style="color:var(--yellow);font-weight:bold;font-size:12px;margin-bottom:4px">CROSS-PLATFORM OVERLAP — Potential Arbitrage</div>';
        arbOpps.forEach(function(a) {
          html += '<div style="font-size:11px;margin-bottom:2px"><span class="cyan">' + esc(a.location) + '</span> ' + a.date.slice(5) + ' — Poly: ' + a.polyEdges + ' edges | Kalshi: ' + a.kalshiBrackets + ' brackets ($' + a.kalshiVol + ' vol)</div>';
        });
        html += '</div>';
      }
    }
  } catch {}

  // ─── NEXRAD HIGH-RES RADAR + LIGHTNING ───
  try {
    var nexradP = fetch('/api/nexrad/all').then(function(r){return r.json()}).catch(function(){return {stations:[],conus:null}});
    var lightningP = fetch('/api/lightning/status').then(function(r){return r.json()}).catch(function(){return {connected:false,totalRecentStrikes:0,cities:[]}});
    var nxResults = await Promise.all([nexradP, lightningP]);
    var nexradData = nxResults[0];
    var lightningData = nxResults[1];

    html += '<div style="margin-top:16px"></div>';
    html += '<div class="terminal-line header-line" style="color:var(--yellow);font-size:13px">NEXRAD DOPPLER RADAR — NOAA Level III (US Cities)</div>';

    // CONUS composite
    if (nexradData.conus) {
      html += '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px">';
      html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,200,0,0.2);border-radius:6px;padding:10px">';
      html += '<div style="color:var(--yellow);font-weight:bold;margin-bottom:6px;font-size:12px">CONUS COMPOSITE — National Reflectivity</div>';
      html += '<img src="' + nexradData.conus.imageUrl + '?t=' + Date.now() + '" style="width:100%;border-radius:4px;border:1px solid rgba(255,255,255,0.1)" loading="lazy" onerror="this.style.display=&quot;none&quot;"/>';
      html += '<div style="font-size:10px;color:var(--dim);margin-top:4px">Coverage: ' + nexradData.conus.totalPrecipPct + '% precip nationally</div>';
      html += '</div>';

      // Lightning status panel
      html += '<div style="background:rgba(255,255,255,0.02);border:1px solid ' + (lightningData.connected ? 'rgba(255,200,0,0.3)' : 'rgba(255,255,255,0.1)') + ';border-radius:6px;padding:10px">';
      html += '<div style="color:var(--yellow);font-weight:bold;margin-bottom:6px;font-size:12px">BLITZORTUNG LIGHTNING — Real-Time</div>';
      html += '<div style="font-size:11px;margin-bottom:8px">';
      html += '<span style="color:' + (lightningData.connected ? 'var(--green)' : 'var(--red)') + ';font-weight:bold">' + (lightningData.connected ? 'CONNECTED' : 'DISCONNECTED') + '</span>';
      html += ' | <span class="cyan">' + lightningData.totalRecentStrikes + '</span> strikes (30min)';
      html += '</div>';

      // Lightning by city
      if (lightningData.cities && lightningData.cities.length > 0) {
        var activeCities = lightningData.cities.filter(function(c){return c.activityLevel !== 'NONE'});
        if (activeCities.length > 0) {
          activeCities.forEach(function(c) {
            var lvlColor = c.activityLevel === 'INTENSE' ? 'var(--red)' : c.activityLevel === 'OVERHEAD' ? 'var(--red)' : c.activityLevel === 'NEARBY' ? 'var(--yellow)' : 'var(--dim)';
            html += '<div style="font-size:11px;margin-bottom:3px;padding:3px 6px;background:rgba(255,200,0,0.05);border-radius:3px">';
            html += '<span class="cyan">' + esc(c.city) + '</span> ';
            html += '<span style="color:' + lvlColor + ';font-weight:bold">' + c.activityLevel + '</span> ';
            html += c.strikesNear + ' near / ' + c.strikesMedium + ' med / ' + c.strikesWide + ' wide';
            if (c.approachingCity) html += ' <span style="color:var(--red);font-weight:bold">APPROACHING</span>';
            if (c.strikesPerMinute > 0) html += ' | ' + c.strikesPerMinute + '/min';
            html += '</div>';
          });
        } else {
          html += '<div style="font-size:11px;color:var(--green)">No lightning activity near monitored cities</div>';
        }
      }
      html += '</div>';
      html += '</div>'; // grid
    }

    // Per-station NEXRAD analysis
    if (nexradData.stations && nexradData.stations.length > 0) {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-bottom:12px">';
      nexradData.stations.forEach(function(st) {
        var borderColor = st.precipCoveragePct > 10 ? 'rgba(255,100,100,0.3)' : st.precipCoveragePct > 0 ? 'rgba(255,255,0,0.2)' : 'rgba(255,255,255,0.08)';
        html += '<div style="background:rgba(255,255,255,0.02);border:1px solid ' + borderColor + ';border-radius:4px;padding:6px">';
        html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">';
        html += '<span style="color:var(--cyan);font-weight:bold;font-size:11px">' + esc(st.city) + ' (' + st.station + ')</span>';
        html += '<span style="font-size:10px;color:' + (st.precipCoveragePct > 5 ? 'var(--yellow)' : 'var(--green)') + '">' + st.precipCoveragePct + '% precip</span>';
        html += '</div>';
        html += '<img src="' + st.imageUrl + '?t=' + Date.now() + '" style="width:100%;border-radius:3px;border:1px solid rgba(255,255,255,0.1);max-height:120px;object-fit:contain" loading="lazy" onerror="this.style.display=&quot;none&quot;"/>';
        html += '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--dim);margin-top:3px">';
        html += '<span>' + st.dominantType + '</span>';
        html += '<span>Max ' + st.maxReflectivity + ' dBZ</span>';
        if (st.stormCells > 0) html += '<span style="color:var(--red)">' + st.stormCells + ' cells</span>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
  } catch {}

  // ─── BIOLOGICAL WEATHER SENSORS (Movebank + eBird) ───
  try {
    var bioP = fetch('/api/biosensors/all').then(function(r){return r.json()}).catch(function(){return {movebank:[],ebird:[],ebirdApiKey:false,inaturalist:[],marine:[]}});
    var tomorrowP = fetch('/api/weather/tomorrow').then(function(r){return r.json()}).catch(function(){return {hasApiKey:false,forecasts:[]}});
    var bioResults = await Promise.all([bioP, tomorrowP]);
    var bioData = bioResults[0];
    var tomorrowData = bioResults[1];

    html += '<div style="margin-top:16px"></div>';
    html += '<div class="terminal-line header-line" style="color:var(--green);font-size:13px">BIOLOGICAL WEATHER SENSORS — Animal Behavioral Anomaly Detection</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">';

    // Movebank panel
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,255,136,0.2);border-radius:6px;padding:10px">';
    html += '<div style="color:var(--green);font-weight:bold;margin-bottom:6px;font-size:12px">MOVEBANK — Animal GPS Tracking</div>';
    if (bioData.movebank && bioData.movebank.length > 0) {
      var anomalies = bioData.movebank.filter(function(s){return s.anomalyDetected});
      if (anomalies.length > 0) {
        anomalies.forEach(function(a) {
          var implColor = a.weatherImplication === 'STORM_INCOMING' ? 'var(--red)' : a.weatherImplication === 'FRONT_APPROACHING' ? 'var(--yellow)' : 'var(--cyan)';
          html += '<div style="padding:4px 8px;background:rgba(255,200,0,0.05);border:1px solid rgba(255,200,0,0.15);border-radius:4px;margin-bottom:4px;font-size:11px">';
          html += '<span class="cyan" style="font-weight:bold">' + esc(a.city) + '</span> ';
          html += '<span style="color:' + implColor + ';font-weight:bold">' + a.weatherImplication.replace(/_/g,' ') + '</span> ';
          html += '(' + a.anomalyType.replace(/_/g,' ') + ', strength ' + a.anomalyStrength + '%) ';
          if (a.leadTimeHours > 0) html += '<span class="dim">~' + a.leadTimeHours + 'h lead</span>';
          html += '<div style="color:var(--dim);font-size:10px;margin-top:2px">' + esc(a.signalDescription) + '</div>';
          html += '</div>';
        });
      } else {
        html += '<div style="font-size:11px;color:var(--dim)">No behavioral anomalies detected</div>';
      }
      var totalStudies = bioData.movebank.reduce(function(s,m){return s+m.studiesNearby},0);
      var totalEvents = bioData.movebank.reduce(function(s,m){return s+m.recentEvents},0);
      html += '<div style="font-size:10px;color:var(--dim);margin-top:4px">' + totalStudies + ' studies monitored | ' + totalEvents + ' GPS positions (24h)</div>';
    } else {
      html += '<div style="font-size:11px;color:var(--dim)">Loading animal tracking data...</div>';
    }
    html += '</div>';

    // eBird panel
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,200,255,0.2);border-radius:6px;padding:10px">';
    html += '<div style="color:var(--cyan);font-weight:bold;margin-bottom:6px;font-size:12px">eBIRD — Migration Anomaly Detection</div>';
    if (!bioData.ebirdApiKey) {
      html += '<div style="font-size:11px;color:var(--yellow)">Set EBIRD_API_KEY in .env for bird migration data</div>';
      html += '<div style="font-size:10px;color:var(--dim);margin-top:2px">Free key: ebird.org/api/keygen</div>';
    } else if (bioData.ebird && bioData.ebird.length > 0) {
      var birdAnomalies = bioData.ebird.filter(function(s){return s.anomalyDetected});
      if (birdAnomalies.length > 0) {
        birdAnomalies.forEach(function(b) {
          var actColor = b.migrationActivity === 'SURGE' ? 'var(--green)' : b.migrationActivity === 'LOW' ? 'var(--red)' : 'var(--yellow)';
          html += '<div style="padding:4px 8px;background:rgba(0,200,255,0.05);border-radius:4px;margin-bottom:4px;font-size:11px">';
          html += '<span class="cyan" style="font-weight:bold">' + esc(b.city) + '</span> ';
          html += '<span style="color:' + actColor + '">' + b.migrationActivity + '</span> ';
          html += b.recentObservations + ' obs / ' + b.notableObservations + ' notable / ' + b.speciesCount + ' species';
          if (b.topNotableSpecies.length > 0) {
            html += '<div style="color:var(--dim);font-size:10px;margin-top:2px">Notable: ' + b.topNotableSpecies.join(', ') + '</div>';
          }
          html += '</div>';
        });
      } else {
        html += '<div style="font-size:11px;color:var(--dim)">Normal migration patterns across all cities</div>';
      }
    }
    html += '</div>';
    html += '</div>'; // grid

    // iNaturalist + OBIS Marine wildlife panels
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">';

    // iNaturalist panel
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(116,172,68,0.3);border-radius:6px;padding:10px">';
    html += '<div style="color:#74ac44;font-weight:bold;margin-bottom:6px;font-size:12px">iNATURALIST — Wildlife Observation Density (No Auth)</div>';
    if (bioData.inaturalist && bioData.inaturalist.length > 0) {
      var inatAnomalies = bioData.inaturalist.filter(function(s){return s.anomalyDetected});
      if (inatAnomalies.length > 0) {
        inatAnomalies.forEach(function(a) {
          var chgColor = a.observationChange < 0 ? 'var(--red)' : 'var(--green)';
          html += '<div style="padding:4px 8px;background:rgba(116,172,68,0.08);border:1px solid rgba(116,172,68,0.15);border-radius:4px;margin-bottom:4px;font-size:11px">';
          html += '<span class="cyan" style="font-weight:bold">' + esc(a.city) + '</span> ';
          html += '<span style="color:' + chgColor + ';font-weight:bold">' + (a.observationChange > 0 ? '+' : '') + a.observationChange + '%</span> ';
          html += '<span style="color:var(--yellow)">' + a.anomalyType.replace(/_/g,' ') + '</span> ';
          html += '(' + a.recentObservations + ' obs / ' + a.baselineObservations + ' baseline)';
          html += '<div style="color:var(--dim);font-size:10px;margin-top:2px">' + esc(a.description) + '</div>';
          html += '</div>';
        });
      }
      // Summary row for all cities
      var inatTotal = bioData.inaturalist.reduce(function(s,i){return s+i.recentObservations},0);
      var inatSpecies = bioData.inaturalist.reduce(function(s,i){return s+i.speciesCount},0);
      html += '<div style="font-size:10px;color:var(--dim);margin-top:4px">' + inatTotal + ' total observations | ' + inatSpecies + ' species across ' + bioData.inaturalist.length + ' cities (24h)</div>';

      // Top species across all cities
      var allSpecies = {};
      bioData.inaturalist.forEach(function(i) {
        (i.topSpecies || []).forEach(function(s) {
          allSpecies[s.name] = (allSpecies[s.name] || 0) + s.count;
        });
      });
      var topAll = Object.entries(allSpecies).sort(function(a,b){return b[1]-a[1]}).slice(0,5);
      if (topAll.length > 0) {
        html += '<div style="font-size:10px;color:var(--dim);margin-top:2px">Top: ' + topAll.map(function(s){return s[0]+' ('+s[1]+')'}).join(', ') + '</div>';
      }
    } else {
      html += '<div style="font-size:11px;color:var(--dim)">Loading wildlife data...</div>';
    }
    html += '</div>';

    // OBIS Marine panel
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,119,182,0.3);border-radius:6px;padding:10px">';
    html += '<div style="color:#0077b6;font-weight:bold;margin-bottom:6px;font-size:12px">OBIS MARINE — Whale, Shark & Seal Tracking (No Auth)</div>';
    if (bioData.marine && bioData.marine.length > 0) {
      var coastalCities = bioData.marine.filter(function(m){return m.isCoastal});
      var marineAnomalies = coastalCities.filter(function(m){return m.anomalyDetected});

      if (marineAnomalies.length > 0) {
        marineAnomalies.forEach(function(m) {
          html += '<div style="padding:4px 8px;background:rgba(0,119,182,0.08);border:1px solid rgba(0,119,182,0.15);border-radius:4px;margin-bottom:4px;font-size:11px">';
          html += '<span class="cyan" style="font-weight:bold">' + esc(m.city) + '</span> ';
          html += '<span style="color:var(--yellow)">' + m.anomalyType.replace(/_/g,' ') + '</span> ';
          html += m.recentSightings + ' sightings';
          if (m.avgShoreDistance > 0) html += ' | avg ' + m.avgShoreDistance + 'km from shore';
          html += '<div style="color:var(--dim);font-size:10px;margin-top:2px">' + esc(m.description) + '</div>';
          html += '</div>';
        });
      }

      // Summary table of coastal cities
      html += '<table class="tracking-table" style="font-size:10px;margin-top:4px"><thead><tr><th>City</th><th>Whales</th><th>Dolphins</th><th>Sharks</th><th>Seals</th><th>Shore</th></tr></thead><tbody>';
      coastalCities.forEach(function(m) {
        if (m.recentSightings === 0) return;
        html += '<tr><td class="cyan">' + esc(m.city) + '</td>';
        html += '<td>' + m.whaleCount + '</td>';
        html += '<td>' + m.dolphinCount + '</td>';
        html += '<td>' + m.sharkCount + '</td>';
        html += '<td>' + m.sealCount + '</td>';
        html += '<td>' + (m.avgShoreDistance > 0 ? m.avgShoreDistance + 'km' : '-') + '</td></tr>';
      });
      html += '</tbody></table>';

      var totalMarine = coastalCities.reduce(function(s,m){return s+m.recentSightings},0);
      html += '<div style="font-size:10px;color:var(--dim);margin-top:4px">' + totalMarine + ' marine sightings across ' + coastalCities.length + ' coastal cities (90 days)</div>';
    } else {
      html += '<div style="font-size:11px;color:var(--dim)">Loading marine data...</div>';
    }
    html += '</div>';
    html += '</div>'; // grid

    // Tomorrow.io section (if API key set)
    if (tomorrowData.hasApiKey && tomorrowData.forecasts && tomorrowData.forecasts.length > 0) {
      var activeTmrw = tomorrowData.forecasts.filter(function(f){return f.current});
      if (activeTmrw.length > 0) {
        html += '<div class="terminal-line header-line" style="color:var(--magenta);font-size:12px;margin-top:8px">TOMORROW.IO — High-Res Nowcast Comparison</div>';
        html += '<table class="tracking-table" style="font-size:11px"><thead><tr>';
        html += '<th>City</th><th>Temp</th><th>Feels</th><th>Precip</th><th>Cloud</th><th>Wind</th><th>Pressure</th><th>UV</th><th>Condition</th>';
        html += '</tr></thead><tbody>';
        activeTmrw.forEach(function(f) {
          var c = f.current;
          html += '<tr>';
          html += '<td class="cyan">' + esc(f.city) + '</td>';
          html += '<td style="font-weight:bold">' + c.temperatureF + 'F</td>';
          html += '<td>' + c.temperatureApparentF + 'F</td>';
          html += '<td style="color:' + (c.precipitationIntensity > 0 ? 'var(--blue)' : 'var(--dim)') + '">' + c.precipitationProbability + '% ' + (c.precipitationIntensity > 0 ? c.precipitationIntensity.toFixed(1) + 'mm/h' : '') + '</td>';
          html += '<td>' + c.cloudCover + '%</td>';
          html += '<td>' + c.windSpeedMph + 'mph</td>';
          html += '<td>' + c.pressure + ' hPa</td>';
          html += '<td>' + c.uvIndex + '</td>';
          html += '<td class="dim">' + c.weatherCode + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
        html += '<div style="font-size:10px;color:var(--dim);margin-top:4px">API quota: ' + tomorrowData.remaining.daily + '/day, ' + tomorrowData.remaining.hourly + '/hr remaining</div>';
      }
    } else if (!tomorrowData.hasApiKey) {
      html += '<div style="font-size:11px;color:var(--yellow);margin-top:8px">Set TOMORROW_API_KEY in .env for high-res nowcasting (free: tomorrow.io/weather-api)</div>';
    }
  } catch {}

  // ─── ENVIRONMENTAL WEATHER INDICATORS ───
  try {
    var indP = fetch('/api/indicators/all').then(function(r){return r.json()}).catch(function(){return {buoys:[],flights:[],streams:[],solar:null,power:[],faa:[],convection:[],tidal:[],sst:[],radiosonde:[],soil:[]}});
    var indicators = await indP;

    html += '<div style="margin-top:16px"></div>';
    html += '<div class="terminal-line header-line" style="color:var(--yellow);font-size:13px">ENVIRONMENTAL INDICATORS — Buoys, Flights, Streams, Solar, Power Grid</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">';

    // Ocean Buoys panel
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,150,255,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:#0096ff;font-weight:bold;font-size:11px;margin-bottom:4px">OCEAN BUOYS — Pressure Tendency</div>';
    if (indicators.buoys && indicators.buoys.length > 0) {
      indicators.buoys.forEach(function(b) {
        var ptdyColor = b.pressureTendency < -3 ? 'var(--red)' : b.pressureTendency < 0 ? 'var(--yellow)' : 'var(--green)';
        var alertBadge = b.stormSignal ? '<span style="color:var(--red);font-weight:bold"> STORM</span>' : '';
        html += '<div style="font-size:10px;margin-bottom:2px"><span class="cyan">' + esc(b.city) + '</span> ' + b.pressure.toFixed(1) + ' hPa <span style="color:' + ptdyColor + '">' + (b.pressureTendency > 0 ? '+' : '') + b.pressureTendency.toFixed(1) + '/3hr</span>' + alertBadge + '</div>';
      });
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading buoy data...</div>';
    }
    html += '</div>';

    // Flight Disruptions panel
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,165,0,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:orange;font-weight:bold;font-size:11px;margin-bottom:4px">FLIGHTS — Airport Weather Proxy</div>';
    if (indicators.flights && indicators.flights.length > 0) {
      indicators.flights.forEach(function(f) {
        var sevColor = f.disruptionSeverity === 'SEVERE' ? 'var(--red)' : f.disruptionSeverity === 'MODERATE' ? 'var(--yellow)' : f.disruptionSeverity === 'MINOR' ? 'orange' : 'var(--green)';
        html += '<div style="font-size:10px;margin-bottom:2px"><span class="cyan">' + esc(f.airport) + '</span> ';
        html += f.departures1h >= 0 ? f.departures1h + ' dep/hr' : '? dep/hr';
        if (f.departureRate >= 0) html += ' <span style="color:' + sevColor + '">(' + f.departureRate + '%)</span>';
        if (f.aircraftInArea >= 0) html += ' | ' + f.aircraftInArea + ' a/c';
        if (f.weatherDisruption) html += ' <span style="color:var(--red);font-weight:bold">' + f.disruptionSeverity + '</span>';
        html += '</div>';
      });
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading flight data...</div>';
    }
    html += '</div>';

    // Stream Gauges panel
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,200,100,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:#00c864;font-weight:bold;font-size:11px;margin-bottom:4px">USGS STREAMS — Rain Confirmation</div>';
    if (indicators.streams && indicators.streams.length > 0) {
      indicators.streams.forEach(function(s) {
        var rainBadge = s.rainConfirmed ? '<span style="color:var(--blue);font-weight:bold"> RAIN</span>' : '';
        var floodBadge = s.floodAlert ? '<span style="color:var(--red);font-weight:bold"> FLOOD</span>' : '';
        html += '<div style="font-size:10px;margin-bottom:2px"><span class="cyan">' + esc(s.city) + '</span> ' + s.gaugesMonitored + ' gauges | avg ' + s.avgStreamflow + ' cfs' + rainBadge + floodBadge + '</div>';
      });
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading stream data...</div>';
    }
    html += '</div>';

    html += '</div>'; // 3-col grid

    // Solar + Power Grid row
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">';

    // Solar Weather
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,200,0,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:var(--yellow);font-weight:bold;font-size:11px;margin-bottom:4px">SOLAR & SPACE WEATHER — Jet Stream Modulation</div>';
    if (indicators.solar) {
      var s = indicators.solar;
      var windColor = s.solarWindTrend === 'EXTREME' ? 'var(--red)' : s.solarWindTrend === 'HIGH' ? 'var(--yellow)' : 'var(--green)';
      html += '<div style="font-size:10px">';
      html += 'Solar wind: <span style="color:' + windColor + ';font-weight:bold">' + s.solarWindSpeed + ' km/s (' + s.solarWindTrend + ')</span>';
      html += ' | Kp: <span style="color:' + (s.geomagneticStorm ? 'var(--red)' : 'var(--green)') + '">' + s.kpIndex.toFixed(1) + '</span>';
      if (s.geomagneticStorm) html += ' <span style="color:var(--red);font-weight:bold">GEO STORM</span>';
      if (s.jetStreamAmplification) html += '<div style="color:var(--yellow);margin-top:2px">Jet stream amplification likely — cold outbreak risk: ' + s.coldOutbreakRisk + '% (lead: ~' + s.leadTimeDays + ' days)</div>';
      html += '</div>';
    }
    html += '</div>';

    // Power Grid
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,255,136,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:var(--green);font-weight:bold;font-size:11px;margin-bottom:4px">NYISO POWER GRID — Temperature Proxy</div>';
    if (indicators.power && indicators.power.length > 0) {
      var nycPower = indicators.power.find(function(p){return p.region === 'NYC'});
      if (nycPower) {
        var loadColor = nycPower.temperatureSignal.includes('HOT') ? 'var(--red)' : nycPower.temperatureSignal.includes('COLD') ? 'var(--cyan)' : 'var(--green)';
        html += '<div style="font-size:10px">NYC: <span style="font-weight:bold">' + nycPower.currentLoadMW + ' MW</span> (<span style="color:' + loadColor + '">' + (nycPower.loadChange > 0 ? '+' : '') + nycPower.loadChange + '% vs baseline</span>) <span style="color:' + loadColor + '">' + nycPower.temperatureSignal.replace(/_/g,' ') + '</span></div>';
      }
      var others = indicators.power.filter(function(p){return p.region !== 'NYC'}).slice(0,4);
      others.forEach(function(p) {
        html += '<div style="font-size:10px;color:var(--dim)">' + esc(p.region) + ': ' + p.currentLoadMW + ' MW</div>';
      });
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading power grid data...</div>';
    }
    html += '</div>';
    html += '</div>'; // 2-col grid

    // ─── TIER 2: FAA, Convection, Tidal, SST, Radiosonde, Soil ───
    html += '<div style="margin-top:12px"></div>';
    html += '<div class="terminal-line header-line" style="color:var(--yellow);font-size:13px">ADVANCED INDICATORS — FAA, Convection/CAPE, Tidal, SST, Radiosonde, Soil Moisture</div>';

    // Row 1: FAA + Convection/CAPE + Tidal
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">';

    // FAA Airport Status
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,100,100,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:#ff6464;font-weight:bold;font-size:11px;margin-bottom:4px">FAA STATUS — Ground Stops & Delays</div>';
    if (indicators.faa && indicators.faa.length > 0) {
      indicators.faa.forEach(function(f) {
        if (f.overallSeverity === 'NONE') return;
        var sevColor = f.overallSeverity === 'SEVERE' ? 'var(--red)' : f.overallSeverity === 'MODERATE' ? 'var(--yellow)' : 'orange';
        html += '<div style="font-size:10px;margin-bottom:2px"><span class="cyan">' + esc(f.city) + '</span> ';
        html += '<span style="color:' + sevColor + ';font-weight:bold">' + f.overallSeverity + '</span>';
        if (f.weatherType && f.weatherType !== 'none') html += ' <span style="color:var(--yellow)">(' + esc(f.weatherType) + ')</span>';
        if (f.maxDelayMinutes > 0) html += ' ' + f.maxDelayMinutes + 'min';
        if (f.trend) html += ' <span style="color:var(--dim)">' + esc(f.trend) + '</span>';
        html += '</div>';
      });
      var noDelays = indicators.faa.filter(function(f){return f.overallSeverity === 'NONE'});
      if (noDelays.length === indicators.faa.length) {
        html += '<div style="font-size:10px;color:var(--green)">All US airports clear ✓</div>';
      }
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading FAA data...</div>';
    }
    html += '</div>';

    // Convection / CAPE
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,50,50,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:#ff3232;font-weight:bold;font-size:11px;margin-bottom:4px">CAPE / CONVECTION — Storm Severity</div>';
    if (indicators.convection && indicators.convection.length > 0) {
      indicators.convection.forEach(function(c) {
        var riskColor = c.convectionRisk === 'EXTREME' ? 'var(--red)' : c.convectionRisk === 'MODERATE' ? 'var(--yellow)' : c.convectionRisk === 'MARGINAL' ? 'orange' : 'var(--green)';
        html += '<div style="font-size:10px;margin-bottom:2px"><span class="cyan">' + esc(c.city) + '</span> ';
        html += 'CAPE:<span style="color:' + riskColor + ';font-weight:bold">' + (c.cape || 0) + '</span> J/kg ';
        html += '<span style="color:' + riskColor + '">(' + c.convectionRisk + ')</span>';
        if (c.capEroding) html += ' <span style="color:var(--red);font-weight:bold">CAP ERODING</span>';
        if (c.stormProbability > 50) html += ' <span style="color:var(--yellow)">' + c.stormProbability + '% storm</span>';
        if (c.soilMoisture !== undefined) html += ' | Soil:' + (c.soilMoisture || 0).toFixed(2);
        html += '</div>';
      });
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading CAPE data...</div>';
    }
    html += '</div>';

    // Tidal / Storm Surge
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,150,255,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:#0096ff;font-weight:bold;font-size:11px;margin-bottom:4px">NOAA TIDES — Storm Surge Detection</div>';
    if (indicators.tidal && indicators.tidal.length > 0) {
      indicators.tidal.forEach(function(t) {
        var surgeColor = t.surgeAlert === 'MAJOR' ? 'var(--red)' : t.surgeAlert === 'MODERATE' ? 'var(--yellow)' : t.surgeAlert === 'MINOR' ? 'orange' : 'var(--green)';
        html += '<div style="font-size:10px;margin-bottom:2px"><span class="cyan">' + esc(t.city) + '</span> ';
        html += (t.waterLevel || 0).toFixed(1) + 'ft';
        if (t.surgeFt !== undefined) html += ' surge:<span style="color:' + surgeColor + '">' + (t.surgeFt > 0 ? '+' : '') + (t.surgeFt || 0).toFixed(2) + 'ft</span>';
        if (t.airPressure) html += ' | ' + t.airPressure.toFixed(1) + ' hPa';
        if (t.surgeAlert && t.surgeAlert !== 'NONE') html += ' <span style="color:' + surgeColor + ';font-weight:bold">' + t.surgeAlert + '</span>';
        html += '</div>';
      });
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading tidal data...</div>';
    }
    html += '</div>';

    html += '</div>'; // 3-col grid

    // Row 2: SST + Radiosonde + Soil Moisture
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">';

    // Sea Surface Temperature
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,200,255,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:#00c8ff;font-weight:bold;font-size:11px;margin-bottom:4px">SEA SURFACE TEMP — Moisture Transport</div>';
    if (indicators.sst && indicators.sst.length > 0) {
      indicators.sst.forEach(function(s) {
        var trendColor = s.trend === 'WARMING' ? 'var(--red)' : s.trend === 'COOLING' ? 'var(--cyan)' : 'var(--green)';
        html += '<div style="font-size:10px;margin-bottom:2px"><span class="cyan">' + esc(s.city) + '</span> ';
        html += (s.sstFahrenheit || 0).toFixed(1) + '°F ';
        html += '<span style="color:' + trendColor + '">' + (s.trend || 'N/A') + '</span>';
        if (s.sstAnomaly) html += ' anom:' + (s.sstAnomaly > 0 ? '+' : '') + s.sstAnomaly.toFixed(1) + '°C';
        html += '</div>';
      });
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading SST data...</div>';
    }
    html += '</div>';

    // Radiosonde / Upper Air
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(200,100,255,0.2);border-radius:6px;padding:8px">';
    html += '<div style="color:#c864ff;font-weight:bold;font-size:11px;margin-bottom:4px">RADIOSONDE — Upper Air Profiles</div>';
    if (indicators.radiosonde && indicators.radiosonde.length > 0) {
      indicators.radiosonde.forEach(function(r) {
        var riskColor = r.instabilityRisk === 'EXTREME' || r.instabilityRisk === 'HIGH' ? 'var(--red)' : r.instabilityRisk === 'MODERATE' ? 'var(--yellow)' : r.instabilityRisk === 'MARGINAL' ? 'orange' : 'var(--green)';
        html += '<div style="font-size:10px;margin-bottom:2px"><span class="cyan">' + esc(r.city) + '</span> ';
        html += 'CAPE:' + (r.cape || 0) + ' PWAT:' + (r.precipitableWater || 0).toFixed(1) + '"';
        html += ' LI:' + (r.liftedIndex || 0).toFixed(1);
        html += ' <span style="color:' + riskColor + '">' + (r.instabilityRisk || 'N/A') + '</span>';
        if (r.inversionDetected) html += ' <span style="color:var(--yellow)">INVERSION</span>';
        html += '</div>';
      });
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading sounding data...</div>';
    }
    html += '</div>';

    // Soil Moisture
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(139,90,43,0.3);border-radius:6px;padding:8px">';
    html += '<div style="color:#8b5a2b;font-weight:bold;font-size:11px;margin-bottom:4px">NASA SOIL MOISTURE — Temp Amplification</div>';
    if (indicators.soil && indicators.soil.length > 0) {
      indicators.soil.forEach(function(s) {
        var condColor = s.soilCondition === 'VERY_DRY' || s.soilCondition === 'SATURATED' ? 'var(--red)' : s.soilCondition === 'DRY' || s.soilCondition === 'WET' ? 'var(--yellow)' : 'var(--green)';
        html += '<div style="font-size:10px;margin-bottom:2px"><span class="cyan">' + esc(s.city) + '</span> ';
        html += '<span style="color:' + condColor + '">' + (s.soilCondition || 'N/A').replace(/_/g,' ') + '</span>';
        html += ' (' + (s.surfaceWetness || 0).toFixed(2) + ')';
        if (s.temperatureAdjustF) html += ' <span style="color:' + (s.temperatureAdjustF > 0 ? 'var(--red)' : 'var(--cyan)') + '">' + (s.temperatureAdjustF > 0 ? '+' : '') + s.temperatureAdjustF + '°F</span>';
        html += ' ' + (s.trend || 'N/A');
        html += '</div>';
      });
    } else {
      html += '<div style="font-size:10px;color:var(--dim)">Loading soil data...</div>';
    }
    html += '</div>';

    html += '</div>'; // 3-col grid

  } catch {}

  // ─── LIVE RADAR & SATELLITE IMAGERY ───
  html += '<div style="margin-top:16px"></div>';
  html += '<div class="terminal-line header-line" style="color:var(--blue);font-size:13px">RADAR & SATELLITE IMAGERY — Live Screenshots + Analysis</div>';

  // Global overview: RainViewer embed + GOES satellite
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">';
  html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(0,100,255,0.2);border-radius:6px;padding:10px">';
  html += '<div style="color:var(--blue);font-weight:bold;margin-bottom:6px;font-size:12px">GLOBAL RADAR — RainViewer Live</div>';
  html += '<div style="position:relative;width:100%;padding-bottom:56%;background:#111;border-radius:4px;overflow:hidden">';
  html += '<iframe src="https://www.rainviewer.com/map.html?loc=40.71,-74.01,4&oFa=1&oC=0&oU=0&oCS=1&oF=0&oAP=0&rmt=4&c=1&o=83&lm=1&layer=radar&sm=1&sn=1" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" loading="lazy"></iframe>';
  html += '</div>';
  html += '</div>';
  html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,200,0,0.2);border-radius:6px;padding:10px">';
  html += '<div style="color:var(--yellow);font-weight:bold;margin-bottom:6px;font-size:12px">GOES-16 SATELLITE — CONUS GeoColor</div>';
  html += '<div style="position:relative;width:100%;padding-bottom:56%;background:#111;border-radius:4px;overflow:hidden">';
  html += '<img src="https://cdn.star.nesdis.noaa.gov/GOES16/ABI/CONUS/GEOCOLOR/latest.jpg" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover" loading="lazy"/>';
  html += '</div>';
  html += '</div>';
  html += '</div>';

  // Per-city radar screenshots with analysis
  try {
    var radarData = await (await fetch('/api/radar/all')).json();
    if (radarData && radarData.length > 0) {
      // Summary table first
      html += '<div class="terminal-line header-line" style="color:var(--blue);font-size:12px;margin-top:8px">CITY RADAR ANALYSIS — Precipitation Detection</div>';
      html += '<table class="tracking-table" style="font-size:11px"><thead><tr>';
      html += '<th>City</th><th>City Precip%</th><th>Type</th><th>Regional%</th><th>Storm Cells</th><th>Approaching?</th><th>Intensity</th>';
      html += '</tr></thead><tbody>';

      radarData.forEach(function(snap) {
        var city = snap.screenshots.find(function(s) { return s.zoom === 'city'; });
        var regional = snap.screenshots.find(function(s) { return s.zoom === 'regional'; });
        if (!city) return;
        var a = city.analysis;
        var ra = regional ? regional.analysis : null;

        var precipColor = a.precipCoveragePct > 20 ? 'var(--red)' : a.precipCoveragePct > 5 ? 'var(--yellow)' : 'var(--green)';
        var typeColor = a.dominantType === 'HEAVY' || a.dominantType === 'EXTREME' ? 'var(--red)' : a.dominantType === 'MODERATE' ? 'var(--yellow)' : a.dominantType === 'LIGHT' ? 'var(--cyan)' : 'var(--green)';

        html += '<tr>';
        html += '<td class="cyan">' + esc(snap.city) + '</td>';
        html += '<td style="color:' + precipColor + ';font-weight:bold">' + a.precipCoveragePct + '%</td>';
        html += '<td style="color:' + typeColor + '">' + a.dominantType + '</td>';
        html += '<td>' + (ra ? ra.precipCoveragePct + '%' : '-') + '</td>';
        html += '<td>' + (ra && ra.stormCells > 0 ? '<span style="color:var(--red);font-weight:bold">' + ra.stormCells + '</span>' : '0') + '</td>';
        html += '<td>' + (a.precipMovingToward ? '<span style="color:var(--red);font-weight:bold">YES</span>' : 'No') + '</td>';
        html += '<td>' + (a.avgIntensity > 0 ? a.avgIntensity + '/100' : '-') + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';

      // Show radar images in a grid — 3 zoom levels per city
      var citiesWithPrecip = radarData.filter(function(s) {
        return s.screenshots.some(function(sc) { return sc.analysis && sc.analysis.precipCoveragePct > 0; });
      });

      // Show all cities radar even without precip (top 6 by interest)
      var citiesToShow = radarData.slice(0, 8);

      html += '<div style="margin-top:8px;font-size:11px;color:var(--dim)">Click any city for zoomed views. Images auto-refresh every 5 minutes.</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;margin-top:8px">';

      citiesToShow.forEach(function(snap) {
        html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:6px">';
        html += '<div style="color:var(--cyan);font-weight:bold;font-size:11px;margin-bottom:4px">' + esc(snap.city) + '</div>';

        // Show 3 zoom levels side by side
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">';
        var zoomLabels = ['Continental', 'Regional', 'City'];
        snap.screenshots.forEach(function(sc, i) {
          html += '<div>';
          html += '<div style="font-size:9px;color:var(--dim);text-align:center">' + zoomLabels[i] + '</div>';
          html += '<img src="' + sc.url + '?t=' + Date.now() + '" style="width:100%;border-radius:3px;border:1px solid rgba(255,255,255,0.1)" loading="lazy" onerror="this.style.display=&quot;none&quot;"/>';
          if (sc.analysis.precipCoveragePct > 0) {
            html += '<div style="font-size:9px;text-align:center;color:' + (sc.analysis.precipCoveragePct > 10 ? 'var(--yellow)' : 'var(--dim)') + '">' + sc.analysis.precipCoveragePct + '% precip</div>';
          }
          html += '</div>';
        });
        html += '</div>';

        // Satellite image if available
        if (snap.satellite) {
          html += '<div style="margin-top:4px">';
          html += '<div style="font-size:9px;color:var(--dim)">Satellite (cloud ' + snap.satellite.cloudPct + '%)</div>';
          html += '<img src="' + snap.satellite.url + '?t=' + Date.now() + '" style="width:100%;border-radius:3px;border:1px solid rgba(255,255,255,0.1);max-height:80px;object-fit:cover" loading="lazy" onerror="this.style.display=&quot;none&quot;"/>';
          html += '</div>';
        }

        html += '</div>';
      });
      html += '</div>';
    }
  } catch {}

  // ─── DATA COLLECTION STATS ───
  html += '<div style="margin-top:16px"></div>';
  html += '<div class="terminal-line header-line" style="font-size:12px">DATA COLLECTION</div>';
  html += '<div class="terminal-line" style="font-size:11px">Price ticks: <span class="cyan">' + ((stats.ticks || 0)).toLocaleString() + '</span> | Forecasts: <span class="cyan">' + (stats.forecasts || 0) + '</span> | Resolutions: <span class="cyan">' + (stats.resolutions || 0) + '</span></div>';

  if (stats.accuracy) {
    html += '<div class="terminal-line" style="font-size:11px">Market accuracy: <span class="yellow">' + stats.accuracy.marketPct + '%</span> | Model: <span class="' + (stats.accuracy.modelPct > stats.accuracy.marketPct ? 'green' : 'yellow') + '">' + (stats.accuracy.modelPct || 'N/A') + '%</span> | Hypothetical PnL: <span class="' + (stats.accuracy.hypotheticalPnl >= 0 ? 'green' : 'red') + '">$' + stats.accuracy.hypotheticalPnl + '</span></div>';
  }

  if (stats.calibration && stats.calibration.length > 0) {
    html += '<div style="margin-top:6px"></div>';
    html += '<div class="terminal-line header-line" style="font-size:11px">FORECAST CALIBRATION BY CITY</div>';
    stats.calibration.forEach(function(c) {
      var biasColor = Math.abs(c.bias) < 2 ? 'var(--green)' : 'var(--yellow)';
      html += '<div class="terminal-line" style="font-size:11px">  ' + c.location + ': bias <span style="color:' + biasColor + '">' + (c.bias > 0 ? '+' : '') + c.bias + 'F</span> | MAE ' + c.mae + 'F | n=' + c.n + '</div>';
    });
  }

  html += '<div class="terminal-line dim" style="margin-top:8px;font-size:10px">Auto-refreshes via WebSocket every 60s | ' + new Date().toLocaleTimeString() + '</div>';
  el.innerHTML = html;
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
    if (state.tab === 'weather') renderWeather();
    else renderTracking();
    addLog('Terminal connected — ' + markets.length + ' markets loaded');
  } catch { addLog('Failed to fetch initial markets'); }
  updateWallet();
  setInterval(updateWallet, 10000);
})();
</script>
</body>
</html>`;

export default server;
