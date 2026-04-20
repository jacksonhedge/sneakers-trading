import type {
  NormalizedMarket,
  ScraperConfig,
  ScraperMetrics,
  ScraperState,
  ScraperStatus,
} from "./types.js";

export abstract class BaseScraper {
  protected config: ScraperConfig;
  protected state: ScraperState = "stopped";
  protected markets: Map<string, NormalizedMarket> = new Map();
  protected metrics: ScraperMetrics = {
    marketsScraped: 0,
    eventsScraped: 0,
    lastSuccessfulFetch: null,
    lastError: null,
    lastErrorTime: null,
    errorCount: 0,
    totalFetches: 0,
    avgLatencyMs: 0,
    uptimePercent: 100,
    startedAt: null,
  };

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private latencySamples: number[] = [];

  constructor(config: ScraperConfig) {
    this.config = config;
  }

  /** Subclasses implement the actual fetch + normalize logic. */
  protected abstract fetchMarkets(): Promise<NormalizedMarket[]>;

  /** Optional: subclasses can generate demo data instead of real API calls. */
  protected abstract generateDemoData(): NormalizedMarket[];

  async start(): Promise<void> {
    if (this.state === "running") return;
    this.state = "starting";
    this.metrics.startedAt = Date.now();
    console.log(`[scraper:${this.config.id}] Starting (interval: ${this.config.pollIntervalMs}ms, demo: ${this.config.demoMode})`);

    await this.poll();

    this.pollTimer = setInterval(() => this.poll(), this.config.pollIntervalMs);
    this.state = "running";
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.state = "stopped";
    console.log(`[scraper:${this.config.id}] Stopped`);
  }

  getStatus(): ScraperStatus {
    return {
      id: this.config.id,
      name: this.config.name,
      category: this.config.category,
      state: this.state,
      mono: this.config.mono,
      tint: this.config.tint,
      pollIntervalMs: this.config.pollIntervalMs,
      metrics: { ...this.metrics },
      sports: this.config.sports,
      apiBase: this.config.apiBase,
    };
  }

  getMarkets(): NormalizedMarket[] {
    return Array.from(this.markets.values());
  }

  getMarket(id: string): NormalizedMarket | undefined {
    return this.markets.get(id);
  }

  private async poll(): Promise<void> {
    const start = Date.now();
    this.metrics.totalFetches++;

    try {
      const results = this.config.demoMode
        ? this.generateDemoData()
        : await this.fetchMarkets();

      const elapsed = Date.now() - start;
      this.recordLatency(elapsed);

      this.markets.clear();
      const seenEvents = new Set<string>();
      for (const m of results) {
        this.markets.set(m.id, m);
        seenEvents.add(m.event.name);
      }

      this.metrics.marketsScraped = results.length;
      this.metrics.eventsScraped = seenEvents.size;
      this.metrics.lastSuccessfulFetch = Date.now();

      if (this.state === "error" || this.state === "rate_limited") {
        this.state = "running";
      }
    } catch (err: any) {
      const elapsed = Date.now() - start;
      this.recordLatency(elapsed);

      this.metrics.errorCount++;
      this.metrics.lastError = err.message ?? String(err);
      this.metrics.lastErrorTime = Date.now();

      if (err.message?.includes("429") || err.message?.includes("rate")) {
        this.state = "rate_limited";
        console.warn(`[scraper:${this.config.id}] Rate limited`);
      } else {
        this.state = "error";
        console.error(`[scraper:${this.config.id}] Error: ${err.message}`);
      }
    }

    this.updateUptime();
  }

  private recordLatency(ms: number): void {
    this.latencySamples.push(ms);
    if (this.latencySamples.length > 100) this.latencySamples.shift();
    this.metrics.avgLatencyMs = Math.round(
      this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length,
    );
  }

  private updateUptime(): void {
    if (this.metrics.totalFetches === 0) {
      this.metrics.uptimePercent = 100;
      return;
    }
    const successCount = this.metrics.totalFetches - this.metrics.errorCount;
    this.metrics.uptimePercent = Math.round((successCount / this.metrics.totalFetches) * 10000) / 100;
  }

  /* ─── Helpers for subclasses ────────────────────────────────────────── */

  protected americanToDecimal(american: number): number {
    if (american > 0) return 1 + american / 100;
    return 1 + 100 / Math.abs(american);
  }

  protected americanToImplied(american: number): number {
    if (american > 0) return 100 / (american + 100);
    return Math.abs(american) / (Math.abs(american) + 100);
  }

  protected decimalToAmerican(decimal: number): number {
    if (decimal >= 2) return Math.round((decimal - 1) * 100);
    return Math.round(-100 / (decimal - 1));
  }

  protected centsToAmerican(cents: number): number {
    if (cents <= 0 || cents >= 100) return 0;
    const implied = cents / 100;
    if (implied >= 0.5) return Math.round(-100 * implied / (1 - implied));
    return Math.round(100 * (1 - implied) / implied);
  }

  protected makeId(platformId: string, externalId: string): string {
    return `${platformId}:${externalId}`;
  }
}
