/* -------------------------------------------------------------------------- */
/*  Sneakers API client — talks to /v1/* endpoints on the Express server       */
/* -------------------------------------------------------------------------- */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export type CategoryId = "politics" | "economics" | "crypto" | "sports" | "tech" | "other";

export interface Market {
  id: string;
  platformId: string;
  platformName: string;
  title: string;
  category: CategoryId;
  categoryLabel: string;
  yesProb: number;
  yesCents: number;
  volume24h: number | null;
  changePct24h: number | null;
  closeTime: number;
  isLive: boolean;
  sport: string;
}

export interface CategoryStat {
  id: CategoryId;
  label: string;
  activeMarkets: number;
  avgProb: number;
  volume24h: number | null;
  changePct24h: number | null;
}

export async function getMarkets(opts: {
  platform?: string;
  category?: string;
  limit?: number;
  sort?: "prob" | "close";
} = {}): Promise<{ markets: Market[]; count: number; totalAcrossPlatforms: number }> {
  const q = new URLSearchParams();
  if (opts.platform) q.set("platform", opts.platform);
  if (opts.category) q.set("category", opts.category);
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.sort) q.set("sort", opts.sort);
  const res = await fetch(`${API_BASE}/v1/markets?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`markets fetch ${res.status}`);
  return res.json();
}

export async function getStats(): Promise<{ categories: CategoryStat[]; totalMarkets: number }> {
  const res = await fetch(`${API_BASE}/v1/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error(`stats fetch ${res.status}`);
  return res.json();
}

export type OpportunityKind = "arbitrage" | "value";
export type OppFreshness = "hot" | "aging" | "stale";

export interface OpportunityLeg {
  marketId: string;
  platformId: string;
  platformName: string;
  marketTitle: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  priceCents: number;
  impliedProb: number;
  platformUrl?: string;
}

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  title: string;
  edgeBps: number;
  confidence: number;
  timeToCloseMs: number;
  discoveredAt: number;
  freshness: OppFreshness;
  score: number;
  legs: OpportunityLeg[];
  explanation: string;
  rationale?: string;
  platforms: string[];
}

export interface OpportunitiesResponse {
  opportunities: Opportunity[];
  total: number;
  arbitrageCount: number;
  valueCount: number;
  generatedAt: number;
}

export async function getOpportunities(opts: {
  kind?: OpportunityKind;
  minEdgeBps?: number;
  limit?: number;
} = {}): Promise<OpportunitiesResponse> {
  const q = new URLSearchParams();
  if (opts.kind) q.set("kind", opts.kind);
  if (opts.minEdgeBps) q.set("min_edge_bps", String(opts.minEdgeBps));
  if (opts.limit) q.set("limit", String(opts.limit));
  const res = await fetch(`${API_BASE}/v1/opportunities?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`opportunities fetch ${res.status}`);
  return res.json();
}

export async function askOToole(message: string): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/otoole/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`otoole chat ${res.status}`);
  const data = (await res.json()) as { reply: string };
  return data.reply;
}

export function formatVolume(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export function formatPct(p: number | null, withSign = true): string {
  if (p == null) return "—";
  const sign = p > 0 ? "+" : p < 0 ? "" : "";
  return `${withSign ? sign : ""}${(p * 100).toFixed(1)}%`;
}

export function formatCloseDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const CATEGORY_META: Record<CategoryId, { mono: string; cls: string; dot: string; chip: string }> = {
  politics:  { mono: "POL", cls: "cat-pol", dot: "cat-pol-dot", chip: "cat-pol-chip" },
  economics: { mono: "ECO", cls: "cat-eco", dot: "cat-eco-dot", chip: "cat-eco-chip" },
  crypto:    { mono: "BTC", cls: "cat-cry", dot: "cat-cry-dot", chip: "cat-cry-chip" },
  sports:    { mono: "SPT", cls: "cat-spo", dot: "cat-spo-dot", chip: "cat-spo-chip" },
  tech:      { mono: "TEC", cls: "cat-tec", dot: "cat-tec-dot", chip: "cat-tec-chip" },
  other:     { mono: "OTH", cls: "cat-pol", dot: "cat-pol-dot", chip: "cat-pol-chip" },
};
