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
  # shellcheck disable=SC2086
  timeout 300 pnpm --silent scrape:${name} >> "$logfile" 2>&1
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

  echo "[$(date '+%F %T')] iteration $iteration complete, sleeping ${INTERVAL}s"
  sleep "$INTERVAL"
done
