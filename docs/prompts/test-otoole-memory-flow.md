# Chrome prompt — O'Toole Strategy + Knowledge + Other QA

End-to-end test of the new O'Toole settings page (`/dashboard/settings/otoole`) and verify that pasted strategy + insight snippets actually flow into O'Toole's chat responses.

This is **all UI + chat — no API keys, no destructive actions**. The "destructive" steps (deleting the test source you create) are explicitly part of cleanup at the end.

---

**Required inputs from the user before you start** — ask in chat if missing:

- `base_url` — defaults to `http://localhost:3000`. Confirm the dev server is running (`pnpm dev` from `~/sneakers-trading/apps/platform`).
- `email` — the test account email. Defaults to `jacksonfitzgerald25@gmail.com` if not provided.
- Magic-link inbox: confirm you can check it in real time during the run.

If any of those are missing, STOP and ask. Don't invent values.

---

## Step 0 — Sanity + sign in

1. Open `<base_url>` in a fresh tab, DevTools → Network tab open.
2. Visit `<base_url>/login`, enter `email`, request the magic link.
3. Pause for the user to open the magic link in the same tab. After auth, you should land on `/dashboard`.

If the dev server is unreachable, STOP and tell the user.

## Step 1 — Settings layout

Navigate to `<base_url>/dashboard/settings/otoole`.

Confirm **three separate white cards** stacked top to bottom:

1. **🎯 Strategy** — header with "LIVE" tag, big textarea, SAVE button, char counter (`X / 8000`).
2. **📚 Knowledge** — header with "LIVE" tag, then three labeled subsections in this order:
   - **TWEETS** with `+ ADD TWEET` button on the right
   - **GITHUB REPOS** with `+ ADD GITHUB SOURCE` button
   - **ARTICLES** with `+ ADD ARTICLE` button
   Each subsection should show "No tweets/github repos/articles yet." in a dashed empty-state box (assuming a fresh account).
3. **🗒 Other** — notes catch-all. Empty-state with `+ ADD NOTE` button inside it.

In Network tab, confirm two GET requests fired on page load:
- `GET /api/otoole/memory` → 200, body `{ ok: true, content: "" }` (or whatever's saved)
- `GET /api/otoole/sources` → 200, body `{ ok: true, sources: [...] }`

If layout is missing any card, or the subsections aren't grouped under Knowledge, screenshot + STOP.

## Step 2 — Save strategy text

1. Click into the Strategy textarea.
2. Type exactly: `I trade only NBA player props between $0.10 and $0.35. Max $50 per ticket. I never touch crypto perpetuals. My favorite players are Lakers role players.`
3. Char counter should update in real time.
4. Click `SAVE`. Network tab should show `PUT /api/otoole/memory` → 200. A small `✓ saved` indicator should appear briefly.
5. Reload the page (`<base_url>/dashboard/settings/otoole`).
6. Confirm the strategy text is still in the textarea after reload (proves Supabase persistence, not just local state).

If the text is gone after reload, capture the network response from PUT + STOP.

## Step 3 — Add a tweet source with a market filter

This source uses a **deliberately distinctive phrase** so we can later confirm O'Toole actually saw it (vs. hallucinating a generic NBA answer).

1. Click `+ ADD TWEET`. Modal opens with title "Add tweet".
2. Confirm:
   - There's NO kind picker — kind is locked to Tweet.
   - Placeholder in CONTENT field mentions tweets.
3. Fill in:
   - LABEL: `lakers role player thread`
   - CONTENT: paste exactly →
     ```
     The fuchsia rule: when a Lakers role player has played fewer than 12 minutes in their last 3 games but is starting tonight, their PRA prop is mispriced by ~7% on average. Backtested 2023-24 season, n=41.
     ```
   - MARKET FILTER: `lakers, nba`
4. Click `SAVE`. Network: `POST /api/otoole/sources` → 200. Modal closes.
5. The new tweet should now appear in the TWEETS list with:
   - The label "lakers role player thread"
   - A green `fires on: lakers, nba` badge
   - A truncated 3-line preview of the content
6. Reload the page — tweet should still be there.

## Step 4 — Add a GitHub source WITHOUT a market filter

A no-filter source should fire on every chat. We'll use this to confirm "always-include" behavior.

1. Click `+ ADD GITHUB SOURCE`. Modal title "Add GitHub source".
2. Fill in:
   - LABEL: `kalshi-public/markets repo notes`
   - CONTENT: `The kalshi-public/markets repo lists every active market with the codename 'persimmon' for political event markets. Use the persimmon prefix when looking up Trump-related contracts.`
   - MARKET FILTER: leave **blank**
3. Save. Confirm the new entry appears in GITHUB REPOS subsection with NO `fires on:` badge (since no filter).

## Step 5 — Add a Note in the Other section

1. Scroll to the **Other** card.
2. Click `+ ADD NOTE` (either the right-side button or the one in the empty state).
3. Modal title "Add note".
4. Fill in:
   - LABEL: `bankroll rule`
   - CONTENT: `Never go below $200 cash on Polymarket — that's the redeposit floor.`
   - MARKET FILTER: `polymarket`
5. Save. Confirm appears in the Other section with green filter badge.

## Step 6 — Verify the filter actually scopes (the important test)

Open O'Toole chat. The chat lives **on the dashboard** — possibilities:

- A right-side panel (try `/dashboard` and look for an OtoolePanel on the right edge)
- A spotlight card on the dashboard with a "Chat with O'Toole" CTA
- A floating chat-bubble FAB (mobile FAB might be visible on desktop too)

Find it and open it. If you can't locate the chat surface within 30 seconds, screenshot the dashboard and ask the user where chat lives.

### Test 6a — message that should trigger the lakers tweet

Send: **`What should I look at for Lakers props tonight?`**

Wait for O'Toole's full response. Then check:

- ✅ PASS if the response references the **fuchsia rule** specifically OR mentions the "12 minutes / 3 games / 7% mispricing / n=41" pattern.
- ⚠️ PARTIAL if the response talks about Lakers role players generally but doesn't echo the distinctive phrasing.
- ❌ FAIL if the response is generic NBA chatter with zero hint that O'Toole saw your snippet.

### Test 6b — message that should NOT trigger the lakers tweet

Send: **`What's the weather like in San Francisco?`**

Wait for O'Toole's full response. Then check:

- ✅ PASS if the response is generic / says it doesn't have weather data / doesn't mention fuchsia, Lakers, NBA, props, or the kalshi `persimmon` codename.
- Note: the GitHub source (no filter) WILL be in the system prompt, but a well-behaved bot shouldn't drop unrelated `persimmon` chatter into a weather question.
- ❌ FAIL if it randomly mentions the fuchsia rule or Lakers — that means filter scoping broke (every source is firing regardless of message).

### Test 6c — message that should trigger the no-filter GitHub source

Send: **`How do I find Trump-related contracts on Kalshi?`**

- ✅ PASS if the response mentions the **persimmon** codename or references the `kalshi-public/markets` repo.
- ❌ FAIL if it doesn't — that means no-filter sources aren't being injected.

### Test 6d — strategy memory check

Send: **`I'm thinking about a $200 bet on a Bitcoin futures contract — thoughts?`**

- ✅ PASS if O'Toole pushes back on the bet size (max $50 per your rule) AND/OR pushes back on crypto perps (your "never touch" rule).
- ❌ FAIL if it just engages with the trade idea without referencing your rules.

## Step 7 — Cleanup

For each of the three sources you added:
1. Hover the row to reveal the `delete` link (top-right of each item).
2. Click delete, confirm the native browser `confirm()`.
3. Confirm the row vanishes from the UI.
4. Network: `DELETE /api/otoole/sources?id=<n>` → 200.

Also clear the Strategy textarea, click SAVE — leaves a clean account behind.

---

## Hard guardrails

- Don't paste any real tweets/articles/repo content from outside the prompt — only the exact test strings above.
- Don't visit production (`sneakersterminal.com`). Localhost only.
- If you can't find the O'Toole chat surface on the dashboard, STOP and ask — do NOT navigate around the whole app guessing.
- If 2FA pops on the magic link, hand back to the user.

## Report back

A punch list per step:
- ✅ pass / ⚠️ partial / ❌ fail
- For ❌: response body or screenshot of the failing UI/chat reply
- For Test 6 (the meat of this run): include the verbatim text of O'Toole's response for each of 6a/6b/6c/6d so the user can judge ambiguous ⚠️ cases themselves
- One bullet at the end: any UI bugs, layout weirdness, or chat behavior worth flagging
