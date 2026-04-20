/* -------------------------------------------------------------------------- */
/*  Scraper smoke-test CLI                                                    */
/*                                                                            */
/*  Runs one poll() against every registered scraper (live, not demo) and     */
/*  prints market counts, latency, error details, and three sample rows per   */
/*  platform. Use this to sanity-check what's actually working.               */
/*                                                                            */
/*  Usage:                                                                    */
/*    npx tsx src/scrapers/run-all.ts              # all scrapers, live       */
/*    npx tsx src/scrapers/run-all.ts --demo       # demo data only           */
/*    npx tsx src/scrapers/run-all.ts dk kalshi    # filter by scraper id     */
/* -------------------------------------------------------------------------- */

import DraftKingsSportsbook from "./draftkings-sportsbook.js";
import FanDuelSportsbook from "./fanduel-sportsbook.js";
import DraftKingsPredict from "./draftkings-predict.js";
import FanDuelPredict from "./fanduel-predict.js";
import Fliff from "./fliff.js";
import SweepsGeneric from "./sweeps-generic.js";
import Kalshi from "./kalshi.js";
import Polymarket from "./polymarket.js";
import type { BaseScraper } from "./base-scraper.js";
import type { NormalizedMarket } from "./types.js";

type Factory = () => BaseScraper;

const REGISTRY: Record<string, Factory> = {
  dk: () => new DraftKingsSportsbook(),
  fd: () => new FanDuelSportsbook(),
  dkp: () => new DraftKingsPredict(),
  fdp: () => new FanDuelPredict(),
  fliff: () => new Fliff(),
  sweeps: () => new SweepsGeneric(),
  kalshi: () => new Kalshi(),
  polymarket: () => new Polymarket(),
};

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function sample(markets: NormalizedMarket[], n = 3): string {
  return markets
    .slice(0, n)
    .map((m) => {
      const odds = m.outcomes
        .slice(0, 2)
        .map((o) => `${o.label}@${o.americanOdds > 0 ? "+" : ""}${o.americanOdds}`)
        .join(" / ");
      return `    ${m.event.name} — ${m.marketName} [${odds}]`;
    })
    .join("\n");
}

async function runOne(id: string, factory: Factory, demo: boolean): Promise<void> {
  const scraper = factory();
  if (demo) {
    // @ts-expect-error - accessing protected config for smoke-test override
    scraper.config.demoMode = true;
  }

  const label = `[${id.padEnd(10)}]`;
  const start = Date.now();
  console.log(`${label} running...`);

  try {
    await scraper.start();
    scraper.stop();

    const status = scraper.getStatus();
    const markets = scraper.getMarkets();
    const elapsed = Date.now() - start;

    const statusIcon =
      status.state === "error" || status.metrics.errorCount > 0 ? "❌" : "✅";

    console.log(
      `${label} ${statusIcon} ${fmtNum(markets.length)} markets · ${
        status.metrics.eventsScraped
      } events · ${elapsed}ms · uptime ${status.metrics.uptimePercent}%`,
    );

    if (status.metrics.lastError) {
      console.log(`${label}    last error: ${status.metrics.lastError}`);
    }
    if (markets.length > 0) {
      console.log(sample(markets));
    }
    console.log("");
  } catch (err: any) {
    console.log(`${label} ❌ FATAL: ${err.message ?? err}`);
    console.log("");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");
  const filters = args.filter((a) => !a.startsWith("--"));

  const targets = filters.length > 0 ? filters : Object.keys(REGISTRY);

  console.log(
    `\n━━━ Sneakers scraper smoke test ━━━ ${
      demo ? "(DEMO DATA)" : "(LIVE)"
    } ━━━\n`,
  );

  for (const id of targets) {
    const factory = REGISTRY[id];
    if (!factory) {
      console.log(`[${id}] unknown — skipping`);
      continue;
    }
    await runOne(id, factory, demo);
  }

  console.log("━━━ done ━━━\n");
}

main().catch((err) => {
  console.error("run-all crashed:", err);
  process.exit(1);
});
