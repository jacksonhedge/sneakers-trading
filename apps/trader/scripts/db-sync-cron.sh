#!/usr/bin/env bash
# Incremental sync: JSONL → Timescale. Runs periodically (launchd every 5min).
# Idempotent because load-jsonl uses ON CONFLICT DO NOTHING on the composite
# PK (observed_at, market_id, outcome_id).
#
# Wired by apps/trader/scripts/com.sneakers.db-loader.plist. Install with:
#   cp apps/trader/scripts/com.sneakers.db-loader.plist ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/com.sneakers.db-loader.plist
#
# Uninstall:
#   launchctl unload ~/Library/LaunchAgents/com.sneakers.db-loader.plist
#   rm ~/Library/LaunchAgents/com.sneakers.db-loader.plist

set -u

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
LOG_DIR="${REPO_ROOT}/apps/trader/data/_loop-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/db-sync.log"

# Postgres 17 binaries are keg-only — brew doesn't symlink to /opt/homebrew/bin.
export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"
# launchd runs with a minimal environment; point pnpm at its real home.
export HOME="${HOME:-/Users/$(whoami)}"
# Same for pnpm's store + node:
export PNPM_HOME="${PNPM_HOME:-${HOME}/Library/pnpm}"
export PATH="${PNPM_HOME}:${PATH}"

cd "$REPO_ROOT"

{
  echo "[$(date '+%F %T')] db-sync starting"
  # --date=today narrows the scan to current-day files; on rollover past
  # midnight we pick up both yesterday's tail + today's head automatically
  # because load-jsonl reads all *.jsonl in a dir if --date is omitted.
  # For simplicity we load everything (idempotent).
  pnpm --filter @sneakers/core db:load-jsonl 2>&1
  RC=$?
  echo "[$(date '+%F %T')] db-sync exit=${RC}"
  echo "---"
} >> "$LOG_FILE" 2>&1

exit 0
