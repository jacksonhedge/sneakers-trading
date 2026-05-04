#!/usr/bin/env bash
# Continuous scraper loop — runs all 5 scrapers on an interval so JSONL
# grows with time-series data overnight. Safe to re-run: each scraper
# appends to today's JSONL. Per-scraper failures are logged and do not
# stop the loop.
#
# Usage:
#   cd ~/sneakers-trading/apps/trader
#   nohup bash scripts/scrape-loop.sh > data/scrape-loop.log 2>&1 &
#   disown   # optional, so it survives terminal close
#
# Interval defaults to 600s (10 min); override with SCRAPE_INTERVAL_SEC env var.
# Stop with: kill $(pgrep -f scrape-loop.sh)

set -u
cd "$(dirname "$0")/.."

INTERVAL="${SCRAPE_INTERVAL_SEC:-600}"
mkdir -p data/_loop-logs

echo "[$(date '+%F %T')] scrape-loop starting, interval=${INTERVAL}s, pid=$$"

run_scraper() {
  local name="$1"
  local cmd="$2"
  local logfile="data/_loop-logs/${name}.log"
  echo "[$(date '+%F %T')] → $name"
  # Use gtimeout (coreutils via brew) if available, otherwise run unbounded.
  # Scrapers exit on their own; timeout is just a safety net.
  local timeout_cmd=""
  if command -v gtimeout >/dev/null 2>&1; then
    timeout_cmd="gtimeout 300"
  elif command -v timeout >/dev/null 2>&1; then
    timeout_cmd="timeout 300"
  fi
  # shellcheck disable=SC2086
  $timeout_cmd pnpm --silent scrape:${name} >> "$logfile" 2>&1
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "[$(date '+%F %T')] ✓ $name done"
  else
    echo "[$(date '+%F %T')] ✗ $name failed (exit $rc); tail of log:"
    tail -5 "$logfile"
  fi
}

iteration=0
while true; do
  iteration=$((iteration + 1))
  echo "[$(date '+%F %T')] iteration $iteration"

  run_scraper polymarket  "scrape:polymarket"
  run_scraper kalshi      "scrape:kalshi"
  run_scraper prophetx    "scrape:prophetx"
  run_scraper novig       "scrape:novig"
  run_scraper og          "scrape:og"
  # prizepicks DISABLED 2026-04-26 — takes 60-90 min per run and blocks
  # the rest of the loop, leaving oddsapi 90+ min stale every iteration.
  # Surface in /admin/scrapers as "DISABLED · NEEDS FIX" so we don't forget.
  # Re-enable after parallelizing per-league requests OR moving prizepicks
  # to its own slow-cadence loop.
  # run_scraper prizepicks  "scrape:prizepicks"
  run_scraper oddsapi     "scrape:oddsapi"
  run_scraper opinion     "scrape:opinion"
  # underdog excluded from the loop: Auth0 JWT expires every ~10 min and we
  # don't have a refresh path that works outside a real browser. Run it
  # manually via `pnpm --filter @sneakers/trader scrape:underdog` after
  # rotating UNDERDOG_BEARER_TOKEN in .env.

  # Recompute markets.canonical_id so the platform's market-detail page
  # gets correct cross-venue groups via indexed lookup. ~20s on prod
  # scale; well under the 10 min interval. Failures are non-fatal —
  # stale canonical_ids just mean degraded cross-venue overlay until
  # the next successful run.
  recompute_logfile="data/_loop-logs/recompute-canonical.log"
  echo "[$(date '+%F %T')] → recompute-canonical"
  if pnpm --filter @sneakers/platform --silent recompute:canonical \
       >> "$recompute_logfile" 2>&1; then
    echo "[$(date '+%F %T')] ✓ recompute-canonical done"
  else
    rc=$?
    echo "[$(date '+%F %T')] ✗ recompute-canonical failed (exit $rc); tail of log:"
    tail -5 "$recompute_logfile"
  fi

  echo "[$(date '+%F %T')] iteration $iteration complete, sleeping ${INTERVAL}s"
  sleep "$INTERVAL"
done
