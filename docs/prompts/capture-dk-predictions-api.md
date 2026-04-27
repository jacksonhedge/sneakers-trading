# Chrome prompt — capture DraftKings Predictions API endpoints

DK Predictions (predictions.draftkings.com) is a SPA. The markets API URL, auth pattern, and response shape are only visible from a logged-in browser session — the static HTML doesn't expose them. This prompt drives Claude Chrome to log in, navigate to the markets list, capture the network calls, and report back the exact cURL and a sample response.

The output of this prompt feeds `apps/trader/src/scrapers/dkpredictions/scrape.ts` (already scaffolded with TODOs at the right spots).

---

Task: capture the live API endpoints + auth pattern + sample response from DraftKings Predictions, so we can build a scraper. End with a structured handoff the user can paste back to their Claude Code session.

Prerequisites:
- DraftKings Predictions account (sign up at https://predictions.draftkings.com if needed; the user has DK Sportsbook KYC already, but Predictions is a separate signup since it's a CFTC DCM, not a sportsbook)
- Funded or unfunded — viewing markets doesn't require a deposit, so unfunded is fine for capture
- Browser devtools open before navigation

---

## Step 1 — Open the markets list with devtools recording

1. Open `https://predictions.draftkings.com/` in a fresh tab.
2. **Before** clicking anything: open Chrome DevTools → **Network** tab → filter to **Fetch/XHR** → check **Preserve log** → click the red 🔴 to start recording (or confirm it's already red).
3. Sign in if prompted.
4. Navigate to a markets / browse / events page. The default landing page should already be loading market data — that's fine.
5. Let the page fully settle (~3-5 seconds of no new network activity).

## Step 2 — Identify the right XHR

Look in the Network tab for requests that:
- Return **JSON** (Content-Type: application/json)
- Have a path containing `markets`, `events`, `contracts`, `predictions`, or similar
- Have a non-trivial response (>1KB; markets data, not config/empty/feature flags)
- Are NOT analytics (`api.draftkings.com/eventstreams/...`, `webeventtracker`, `gtm`, `mixpanel`, etc. — skip)
- Are NOT static assets (`*.js`, `*.css`, `*.svg`, `*.woff`, `*.json` for translations)

**The most promising candidate** is usually a request right after the page settles whose response includes an array of objects with `title`, `outcomes`, `prices`, or `event_id` fields.

If you see multiple candidates (e.g., one for events list + one for a single event's markets), capture **both**.

## Step 3 — For each captured XHR, copy the cURL command

1. Right-click the XHR row → **Copy** → **Copy as cURL (bash)**.
2. Note the **response shape** — open the request's "Response" or "Preview" tab; jot down the top-level JSON keys and the shape of the first market object.

Repeat for each promising endpoint (probably 1-3 total).

## Step 4 — Capture the auth pattern

In the captured cURL command, identify:
- **Authorization header** — likely `authorization: Bearer eyJ...` (a JWT). The full string starting with `eyJ` is the token; that's what gets stored.
- **Other required headers** — `x-client-version`, `x-region`, `x-platform`, `accept-language`, `user-agent`, `cookie` etc. DK SPAs typically reject requests missing client-version headers, so capture them all.
- **Cookies** — if auth is cookie-based instead of (or in addition to) Bearer, note which cookie names are present.

## Step 5 — Try the cURL outside the browser as a sanity check

Open Terminal. Paste the cURL command. Run it. Confirm:
- Status: 200
- Response: JSON with markets data
- Response time: <2s

If it fails (401/403): something is browser-specific. Common culprits:
- A `cookie` header that the curl version stripped
- A `dpop` or `x-csrf-token` header set per-request
- A short-lived JWT that already expired (re-grab from a fresh page load)

If it works: you have a stable scraper auth path.

## Step 6 — Report back

Return as:

```
## API base URL
e.g. https://api.predictions.draftkings.com  (extract from cURL URL prefix)

## Endpoints captured (1-3)
1. GET /events?status=open  →  list of events
2. GET /events/{id}/markets  →  markets per event
3. (anything else)

## Auth
- Header name: <e.g. authorization>
- Format: <e.g. Bearer eyJ...>
- Token TTL hint (decode the JWT at jwt.io if the user is comfortable; report the `exp` claim — typically 1h or 24h for DK)
- Other required headers: <list>

## Response shape — first endpoint
Top-level keys: {events: [...]}
Each event: {id, title, scheduled, status, ...}

## Response shape — second endpoint (if any)

## Sample full cURL command (1 working call)
curl ... 

## Sample response (first 1500 chars of JSON, prettified)

## Anything weird
```

Include the **redacted** Authorization header in the cURL — replace the token after `Bearer ` with `<TOKEN>`. The user pastes the real token separately into their `.env` file.

---

## Boundaries

- DO NOT click any "Deposit," "Trade," "Buy," or "Sell" button. We're capturing read endpoints only, not testing trade execution.
- DO NOT navigate away from `predictions.draftkings.com` or `*.draftkings.com` (`api.draftkings.com` is the SDK telemetry domain — ignore those XHRs).
- DO NOT clear cookies or sign out — we want the same session that's hitting the API to be reproducible.
- If the site shows a "verifying your location" geofence that blocks markets in the user's state: report that and STOP. The user can either VPN to a covered state or work around it; we shouldn't try to spoof the geofence from a Chrome session.
- If sign-up requires SSN / KYC and the user doesn't have an account yet: STOP and tell them. The capture requires a real account.
- If the cURL exceeds 8KB (huge cookie jars from DK), trim to just the headers/cookies that look auth-relevant when pasting back. Full thing in a code block is fine; we just don't want it in chat-message form.
