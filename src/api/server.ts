/* -------------------------------------------------------------------------- */
/*  Sneakers API v1                                                           */
/*                                                                            */
/*  Minimal Express server that runs the Kalshi + Polymarket scrapers and     */
/*  exposes a clean REST contract the terminal consumes.                      */
/*                                                                            */
/*  Run:                                                                      */
/*    npx tsx src/api/server.ts                   # :4000                     */
/*    PORT=8080 npx tsx src/api/server.ts         # custom port               */
/* -------------------------------------------------------------------------- */

import express from "express";
import type { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import Kalshi from "../scrapers/kalshi.js";
import Polymarket from "../scrapers/polymarket.js";
import type { BaseScraper } from "../scrapers/base-scraper.js";
import type { NormalizedMarket } from "../scrapers/types.js";
import {
  scanOpportunities,
  type Opportunity,
  type OpportunityKind,
} from "../services/opportunity-scanner.js";

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(express.json());

/* ─── CORS (wide-open for dev; tighten in prod via env) ─────────────────── */
const ALLOWED = (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED.includes("*") || (origin && ALLOWED.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

/* ─── Scraper registry ──────────────────────────────────────────────────── */

const scrapers: Record<string, BaseScraper> = {
  kalshi: new Kalshi(),
  polymarket: new Polymarket(),
};

Promise.all(
  Object.entries(scrapers).map(async ([id, s]) => {
    try {
      await s.start();
      console.log(`[api] ${id} scraper started`);
    } catch (err) {
      console.warn(`[api] ${id} failed to start:`, (err as Error).message);
    }
  }),
);

/* ─── Display transform — frontend-friendly shape ───────────────────────── */

type CategoryId = "politics" | "economics" | "crypto" | "sports" | "tech" | "other";

interface DisplayMarket {
  id: string;
  platformId: string;
  platformName: string;
  title: string;
  category: CategoryId;
  categoryLabel: string;
  yesProb: number;                   // 0-1
  yesCents: number;                  // 0-100
  volume24h: number | null;          // raw number; frontend formats
  changePct24h: number | null;       // -1..1 (null when unknown)
  closeTime: number;                 // unix ms
  isLive: boolean;
  sport: string;
}

const CATEGORY_RULES: Array<{ id: CategoryId; label: string; re: RegExp }> = [
  { id: "politics",  label: "Politics",  re: /\b(president|election|trump|biden|harris|approval|senate|congress|mayor|governor|vote)\b/i },
  { id: "economics", label: "Economics", re: /\b(fed|rate|cpi|inflation|gdp|recession|unemployment|jobs|ppi|fomc)\b/i },
  { id: "crypto",    label: "Crypto",    re: /\b(bitcoin|btc|ethereum|eth|crypto|solana|doge|token|coin)\b/i },
  { id: "sports",    label: "Sports",    re: /\b(nfl|nba|mlb|nhl|ufc|world cup|fifa|soccer|tennis|golf|masters|super bowl|stanley cup|finals|cup|match)\b/i },
  { id: "tech",      label: "Tech",      re: /\b(nvidia|apple|google|microsoft|openai|tesla|meta|tsmc|stock|ipo)\b/i },
];

function categorize(title: string, sport: string): { id: CategoryId; label: string } {
  if (["NFL","NBA","MLB","NHL","MMA","Soccer","Tennis","Golf","NCAAF","NCAAB","Esports"].includes(sport)) {
    return { id: "sports", label: "Sports" };
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(title)) return { id: rule.id, label: rule.label };
  }
  return { id: "other", label: "Other" };
}

function toDisplay(m: NormalizedMarket): DisplayMarket {
  const yesOutcome = m.outcomes.find((o) => o.side === "yes") ?? m.outcomes[0];
  const yesProb = yesOutcome?.impliedProb ?? 0.5;
  const yesCents = yesOutcome?.priceCents ?? Math.round(yesProb * 100);
  const { id, label } = categorize(m.event.name, m.sport);
  return {
    id: m.id,
    platformId: m.platformId,
    platformName: m.platformName,
    title: m.event.name,
    category: id,
    categoryLabel: label,
    yesProb,
    yesCents,
    volume24h: null, // TODO: pass through from scraper when we enrich
    changePct24h: null,
    closeTime: m.event.startTime,
    isLive: m.event.isLive,
    sport: m.sport,
  };
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function collectAll(): DisplayMarket[] {
  const all: DisplayMarket[] = [];
  for (const s of Object.values(scrapers)) {
    for (const m of s.getMarkets()) all.push(toDisplay(m));
  }
  return all;
}

function filterMarkets(
  markets: DisplayMarket[],
  opts: { platform?: string; category?: string; limit?: number; sort?: "prob" | "close" },
): DisplayMarket[] {
  let out = markets;
  if (opts.platform) {
    const set = new Set(opts.platform.split(",").map((s) => s.trim().toLowerCase()));
    out = out.filter((m) => set.has(m.platformId));
  }
  if (opts.category) {
    const set = new Set(opts.category.split(",").map((s) => s.trim().toLowerCase()));
    out = out.filter((m) => set.has(m.category));
  }
  if (opts.sort === "prob") out = [...out].sort((a, b) => b.yesProb - a.yesProb);
  else if (opts.sort === "close") out = [...out].sort((a, b) => a.closeTime - b.closeTime);
  if (opts.limit) out = out.slice(0, opts.limit);
  return out;
}

/* ─── Routes ────────────────────────────────────────────────────────────── */

app.get("/v1/health", (_req: Request, res: Response) => {
  const status = Object.fromEntries(
    Object.entries(scrapers).map(([id, s]) => [id, s.getStatus()]),
  );
  res.json({ ok: true, scrapers: status, time: Date.now() });
});

app.get("/v1/markets", (req: Request, res: Response) => {
  const markets = collectAll();
  const filtered = filterMarkets(markets, {
    platform: req.query.platform as string | undefined,
    category: req.query.category as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    sort: req.query.sort as "prob" | "close" | undefined,
  });
  res.json({ markets: filtered, count: filtered.length, totalAcrossPlatforms: markets.length, time: Date.now() });
});

app.get("/v1/markets/hot", (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 8;
  const markets = collectAll();
  const hot = [...markets]
    .sort((a, b) => Math.abs(0.5 - a.yesProb) * -1 - Math.abs(0.5 - b.yesProb) * -1)
    .slice(0, limit);
  res.json({ markets: hot });
});

app.get("/v1/stats", (_req: Request, res: Response) => {
  const markets = collectAll();
  const cats: CategoryId[] = ["politics", "economics", "crypto", "sports", "tech"];
  const categories = cats.map((id) => {
    const subset = markets.filter((m) => m.category === id);
    const avgProb = subset.length > 0
      ? subset.reduce((s, m) => s + m.yesProb, 0) / subset.length
      : 0;
    return {
      id,
      label: CATEGORY_RULES.find((r) => r.id === id)?.label ?? id,
      activeMarkets: subset.length,
      avgProb: Math.round(avgProb * 10000) / 10000,
      volume24h: null,
      changePct24h: null,
    };
  });
  res.json({ categories, totalMarkets: markets.length, time: Date.now() });
});

app.get("/v1/platforms", (_req: Request, res: Response) => {
  res.json({
    platforms: Object.entries(scrapers).map(([id, s]) => {
      const st = s.getStatus();
      return {
        id,
        name: st.name,
        category: st.category,
        mono: st.mono,
        tint: st.tint,
        state: st.state,
        markets: st.metrics.marketsScraped,
        lastFetch: st.metrics.lastSuccessfulFetch,
      };
    }),
  });
});

/* ─── Opportunities cache ───────────────────────────────────────────────── */

let oppCache: { at: number; data: Opportunity[] } = { at: 0, data: [] };
const OPP_TTL_MS = 5000; // cheap re-rank every 5s

function getOpportunities(): Opportunity[] {
  const now = Date.now();
  if (now - oppCache.at < OPP_TTL_MS && oppCache.data.length > 0) return oppCache.data;
  const allMarkets: NormalizedMarket[] = [];
  for (const s of Object.values(scrapers)) allMarkets.push(...s.getMarkets());
  oppCache = { at: now, data: scanOpportunities(allMarkets) };
  return oppCache.data;
}

app.get("/v1/opportunities", (req: Request, res: Response) => {
  const kind = (req.query.kind as OpportunityKind | undefined) ?? undefined;
  const minBps = req.query.min_edge_bps ? Number(req.query.min_edge_bps) : 0;
  const limit = req.query.limit ? Number(req.query.limit) : 25;
  let opps = getOpportunities();
  if (kind === "arbitrage" || kind === "value") opps = opps.filter((o) => o.kind === kind);
  if (minBps > 0) opps = opps.filter((o) => o.edgeBps >= minBps);
  res.json({
    opportunities: opps.slice(0, limit),
    total: opps.length,
    arbitrageCount: opps.filter((o) => o.kind === "arbitrage").length,
    valueCount: opps.filter((o) => o.kind === "value").length,
    generatedAt: oppCache.at,
  });
});

/* ─── Enterprise leads ──────────────────────────────────────────────────── */

const __dirname_api = path.dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = path.join(__dirname_api, "../../logs/enterprise-leads.jsonl");
const leadIpHits = new Map<string, number[]>();

function rateLimitLead(ip: string): boolean {
  const now = Date.now();
  const recent = (leadIpHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 3) return false; // max 3 leads/min per ip
  recent.push(now);
  leadIpHits.set(ip, recent);
  return true;
}

app.post("/v1/enterprise/lead", (req: Request, res: Response) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  if (!rateLimitLead(ip)) return res.status(429).json({ error: "too many submissions — try again in a minute" });

  const { name, email, company, chairs, useCase, role, phone } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "name required" });
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "valid work email required" });
  if (typeof company !== "string" || !company.trim()) return res.status(400).json({ error: "company required" });
  if (typeof useCase !== "string" || !useCase.trim()) return res.status(400).json({ error: "use case required" });

  const lead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim().slice(0, 120),
    email: email.trim().slice(0, 200),
    company: company.trim().slice(0, 200),
    role: typeof role === "string" ? role.trim().slice(0, 120) : null,
    chairs: Math.max(1, Math.min(1000, Number(chairs) || 1)),
    useCase: useCase.trim().slice(0, 4000),
    phone: typeof phone === "string" ? phone.trim().slice(0, 60) : null,
    ip,
    submittedAt: Date.now(),
  };

  try {
    fs.mkdirSync(path.dirname(LEADS_FILE), { recursive: true });
    fs.appendFileSync(LEADS_FILE, JSON.stringify(lead) + "\n");
    console.log(`[enterprise] new lead: ${lead.name} @ ${lead.company} — ${lead.chairs} chair(s)`);
    res.json({ id: lead.id, ok: true });
  } catch (err) {
    console.error("[enterprise] lead persist failed:", err);
    res.status(500).json({ error: "could not save lead" });
  }
});

app.post("/v1/otoole/chat", (req: Request, res: Response) => {
  const { message } = req.body ?? {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message required" });
  }
  // TODO: swap for Claude API call with market context injected.
  const reply = cannedReply(message);
  res.json({ reply });
});

function cannedReply(msg: string): string {
  const lower = msg.toLowerCase();
  if (/portfolio|position|holding/.test(lower)) return "Your portfolio is up +3.2% today. Strongest performer: Fed Rate Cut YES at +$84.";
  if (/risk|exposure|safe/.test(lower)) return "Max single-position exposure: 18%. Concentration risk in Crypto — consider hedging with Economics NO.";
  if (/fed|rate|cut/.test(lower)) return "Fed Rate Cut June 2026 is at 72% YES, up 8.2% on 340% volume surge.";
  if (/bitcoin|btc|crypto/.test(lower)) return "BTC $150K EOY at 34% YES. Whale activity on NO side — $180K at 66¢.";
  if (/nvidia|nvda/.test(lower)) return "Nvidia $200 Q3 at 61% YES. Earnings in 4 days — expect volatility.";
  if (/recession/.test(lower)) return "US Recession 2026 at 41% YES, down 4.1% on strong jobs report. NO may be underpriced.";
  return "I can help with **portfolio**, **risk**, **insights**, specific markets, or scanning for edge. What do you need?";
}

/* ─── Start ─────────────────────────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`\nSneakers API v1 listening on http://localhost:${PORT}`);
  console.log(`  GET  /v1/health`);
  console.log(`  GET  /v1/markets?platform=kalshi&category=politics&limit=20&sort=prob`);
  console.log(`  GET  /v1/markets/hot?limit=8`);
  console.log(`  GET  /v1/stats`);
  console.log(`  GET  /v1/platforms`);
  console.log(`  GET  /v1/opportunities?kind=arbitrage|value&min_edge_bps=200&limit=25`);
  console.log(`  POST /v1/otoole/chat   body: { message: string }`);
  console.log(`  POST /v1/enterprise/lead   body: { name, email, company, chairs, useCase, ... }`);
});
