#!/usr/bin/env bash
# Sanity checks for the local auth flow against http://localhost:3000.
# Run individual sections by uncommenting, or run the whole thing with:
#   bash apps/platform/scripts/test-auth-curls.sh
#
# Tip: pipe to `jq` for pretty output if you have it installed
# (`brew install jq`). Otherwise the raw JSON is fine.

set -u  # error on unset vars
HOST="http://localhost:3000"

hr() { echo "────────────────────────────────────────────────────────────"; }

# ─── 1) Dev-mode check — should NOT contain devLink ──────────────────────
hr
echo "[1] Dev mode OFF check"
echo "    expected: { ok: true, status: 'magic_link_sent' }  (no devLink)"
curl -sX POST "$HOST/api/auth/login" \
  -H "content-type: application/json" \
  -H "origin: $HOST" \
  -d '{"email":"sanity@example.com"}'
echo

# ─── 2) CSRF — foreign origin should be rejected ─────────────────────────
hr
echo "[2] CSRF: foreign origin → expect 403"
curl -sX POST "$HOST/api/auth/login" \
  -H "content-type: application/json" \
  -H "origin: https://evil.example.com" \
  -d '{"email":"x@example.com"}' -w "\n  HTTP %{http_code}\n"

# ─── 3) CSRF — no origin (server-to-server) → expect 200 ────────────────
hr
echo "[3] CSRF: no origin (Stripe-webhook-shaped) → expect 200"
curl -sX POST "$HOST/api/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"x@example.com"}' -w "\n  HTTP %{http_code}\n"

# ─── 4) CSRF — same origin → expect 200 ─────────────────────────────────
hr
echo "[4] CSRF: same origin → expect 200"
curl -sX POST "$HOST/api/auth/login" \
  -H "content-type: application/json" \
  -H "origin: $HOST" \
  -d '{"email":"x@example.com"}' -w "\n  HTTP %{http_code}\n"

# ─── 5) Enumeration — real vs unknown email should look identical ───────
hr
echo "[5a] Login lookup for an EXISTING email"
curl -sX POST "$HOST/api/auth/login" \
  -H "content-type: application/json" \
  -H "origin: $HOST" \
  -d '{"email":"YOUR_REAL_EMAIL@example.com"}'  # <-- edit me
echo

echo "[5b] Login lookup for a DEFINITELY-NOT-A-USER email"
curl -sX POST "$HOST/api/auth/login" \
  -H "content-type: application/json" \
  -H "origin: $HOST" \
  -d '{"email":"definitely-not-a-real-9999@example.com"}'
echo "  → both should be HTTP 200 with identical body shapes"

# ─── 6) Send a real magic link to YOUR inbox ────────────────────────────
hr
echo "[6] SEND REAL MAGIC LINK — edit the email below, then uncomment:"
# curl -sX POST "$HOST/api/auth/login" \
#   -H "content-type: application/json" \
#   -H "origin: $HOST" \
#   -d '{"email":"YOUR_REAL_EMAIL@example.com"}'
echo "  (commented out by default — uncomment to actually send)"

hr
echo "Done."
