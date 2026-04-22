#!/usr/bin/env bash
# Apply every .sql file in ../migrations in order. Idempotent — all migrations
# use IF NOT EXISTS / if_not_exists so re-running is safe.
set -euo pipefail

DB_NAME="${DB_NAME:-sneakers}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/migrations"

echo "Applying migrations from $DIR to database \"$DB_NAME\"..."
for f in "$DIR"/*.sql; do
  echo ""
  echo "── $(basename "$f")"
  psql "$DB_NAME" -v ON_ERROR_STOP=1 -f "$f"
done

echo ""
echo "✓ Migrations complete."
