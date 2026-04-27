# Dashboard functional audit — what actually works vs placeholder vs broken

Paste to Claude Chrome. Logs in as a real user and exercises every
interactive element on the dashboard surface. Goal is **per-feature
functional verdicts** — not just "does the page render", but "does the
button do the thing".

For each feature: mark one of
- ✅ **WORKS** — clicked it, observed the expected outcome
- 🔧 **BROKEN** — clicked it, got error / silence / wrong outcome
- 🟡 **PLACEHOLDER** — visibly stubbed ("SOON" badge, empty state, "Coming soon")
- 🔒 **GATED** — requires higher tier / verification / permissions; UI gates correctly
- ⏭️ **SKIP** — couldn't test (need cap/admin/etc.)

End with a per-area summary table. Goal is a punch list of what to fix
before showing the dashboard to testers.

---

I need a thorough functional walkthrough of `http://localhost:3000` —
specifically the authenticated dashboard surface. Use a fresh user
account, click every visible interactive element, verify outcomes.

## Setup

1. Dev server running on `localhost:3000`. Confirm `AUTH_DEV_RETURN_LINK`
   state via:
   ```
   curl -sX POST http://localhost:3000/api/auth/login \
     -H "content-type: application/json" -H "origin: http://localhost:3000" \
     -d '{"email":"sanity@example.com"}' | jq
   ```
   - If response includes `devLink` → you're in dev mode (faster, no email needed)
   - If no `devLink` → you're using real Resend; ask user for an email they own

2. Sign in fresh:
   - In dev mode: visit `/signup`, submit a fresh email like
     `dashfunc-test-1@example.com`, click the dev link from the response
     OR from the browser. Land on /dashboard.
   - In real-email mode: ask user for their email + magic-link URL.

3. Browser devtools open in two columns: Console + Network.

4. Have ready: 1 valid LLM key the user is willing to test with (any
   OpenAI/Anthropic test key works). They'll paste it into Phase 4.5
   when prompted. If they don't have one, mark Phase 4.5 as SKIP.

---

## Phase 1 — Header / global nav

On `/dashboard`, exercise the top bar + left sidebar:

| Element | Action | Expected | Verdict |
|---|---|---|---|
| Logo / "Sneakers TERMINAL" link | click | navigate to / or /dashboard | |
| Search box | type "kalshi" | dropdown of market suggestions | |
| Search box `/` shortcut | press `/` | search box focuses | |
| Simple / Medium / Terminal pill | click each | view-density toggles | |
| `%` `¢` `±` toggle | click each | price format updates across page | |
| FOR BUSINESS button | click | navigates to pricing? signup? | |
| CONNECT WALLET button | click | wallet connect modal/page | |
| LIVE / updated indicator | hover | tooltip with last update time | |
| Profile avatar (top right) | click | dropdown OR navigate to /dashboard/profile | |
| Sidebar: Dashboard | click | already there, no-op | |
| Sidebar: Signals | click | "SOON" badge present, no nav OR routes there | |
| Sidebar: Markets | click | navigate to /markets | |
| Sidebar: Portfolio | click | "SOON" or routes | |
| Sidebar: Calendar | click | "SOON" | |
| Sidebar: Heatmap | click | "SOON" | |
| Sidebar: Scanner | click | "SOON" | |
| Sidebar: Order Book | click | "SOON" | |
| Sidebar: Positions | click | "SOON" | |
| Sidebar: History | click | "SOON" | |
| Sidebar: Simulator | click | "SOON" | |
| O'TOOLE AI section | click | toggle / nothing | |

**Output**: a checklist with ✅/🔧/🟡/🔒/⏭️ per row.

## Phase 2 — Dashboard main feed

On `/dashboard`, the central area:

| Element | Action | Expected | Verdict |
|---|---|---|---|
| Yellow "Set up your wallet" banner | click SET UP button | navigates somewhere | |
| Yellow banner | click `×` | banner dismisses (and stays dismissed on reload?) | |
| MEET O'TOOLE hero card | click "Open settings →" | routes to /dashboard/settings/otoole | |
| MEET O'TOOLE hero card | click "Start teaching →" | "SOON" / Beta? | |
| MEET O'TOOLE hero card | click "Join the waitlist →" | autotrade waitlist? | |
| MEET O'TOOLE | click `×` to dismiss | dismisses | |
| All Markets / Sports / Politics / Economics / Crypto / Tech / Other chips | click each | filters the cards below | |
| Politics / Economics / Crypto / Sports stat cards | click | navigates to filtered list | |
| Biggest Volume panel | click any row | navigates to /dashboard/markets/[plat]/[id] | |
| Cross-Book Spread panel | look | shows pairs OR "no pairs" empty state | |
| Normalized Market Performance | look | renders chart OR empty state | |
| Biggest Movers panel | click any row | navigates to market detail | |

**Output**: per-row verdict + note any that 404 or silently redirect.

## Phase 3 — Profile page

Visit `/dashboard/profile`. Exercise each card:

| Card | Action | Expected | Verdict |
|---|---|---|---|
| EMAIL card | check `.EDU DETECTED` badge if applicable | matches the user's email | |
| PLAN card | click "Manage" / upgrade button if present | routes to /dashboard/billing | |
| STUDENT VERIFICATION | click "Verify for 75% off" | routes to verification form OR shows "match-edu-email" gate | |
| UNIVERSITY card | click any action | sets/clears university | |
| REFERRALS card | click "Copy link" | clipboard contains the referral URL | |
| BOT & WALLET card | click any of the 3 join-status rows | routes to relevant join page | |
| Footer Quick Links | click each (Billing, Settings, etc.) | each routes to expected page | |

## Phase 4 — Settings: account-type + api-keys

`/dashboard/settings`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Individual / Business toggle | click Business | flips, persists on reload | |
| Individual / Business toggle | click back to Individual | flips back, persists | |
| Link to API Keys | click | routes to /dashboard/settings/api-keys | |

`/dashboard/settings/api-keys`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Anthropic key form | paste a fake key like `sk-ant-fake-12345` | save button enabled | |
| Anthropic save | submit | error "key didn't verify" OR success | |
| OpenAI key form | paste fake `sk-fake-12345` | similar | |
| List of saved keys | look | shows preview like `sk-a…f2d4` (first/last 4 only, NEVER the full key) | |
| Delete a key | click trash icon | row disappears | |

## Phase 4.5 — O'Toole BYO key (only if user provides a real key)

In `/dashboard/settings/api-keys`, paste a real LLM key the user gave you.
Save. Then go to `/dashboard` and ask O'Toole "what's hot today?". The
response should:
- Be a real LLM response (not the stub "no API key configured" message)
- The Network tab response payload shows `usingByoKey: true`
- The `creditsSpent` field is 0 (BYO bypasses credits)

✅ if real response, 🔧 if stub appeared anyway.

## Phase 5 — O'Toole sidebar

On `/dashboard`, the right-side O'Toole panel:

| Element | Action | Expected | Verdict |
|---|---|---|---|
| Auto / Active toggle | click | toggles, persists | |
| Find Edge chip | click | message sent, response within 30s | |
| Whale Alerts chip | click | response | |
| Portfolio Risk chip | click | response (likely admits no positions) | |
| Best Bets chip | click | response | |
| Ask box | type "what's the highest volume Kalshi market right now?" + send | response references real Kalshi markets | |
| Model selector | change to a different model (Sonnet, Opus) | model is gated by tier — should refuse with `model_requires_upgrade` for free users | |
| Cap counter (`X/Y today · tier`) | check | displays usage; X increments after each message | |
| "thinking" indicator | watch | clears after every response (success OR error) | |

🟡 If `ANTHROPIC_API_KEY` isn't set and BYO isn't configured, every send
returns the stub message — mark as PLACEHOLDER (not BROKEN), but verify
the "thinking" indicator clears (it was a recent bugfix).

## Phase 6 — Settings: O'Toole + Autotrade

`/dashboard/settings/otoole`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Default model dropdown | pick Sonnet | save persists | |
| Reload page | check | dropdown shows last selection | |

`/dashboard/settings/autotrade`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Join waitlist button | click | toggles to "✓ on the list" + persists | |
| Reload page | check | still shows "on the list" | |

## Phase 7 — Connections

`/dashboard/connections`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Each LIVE venue card (Kalshi, Polymarket, Sleeper, etc.) | click | opens venue detail OR external link OR routes to /venues | |
| COMING SOON cards | click | nothing or shows "soon" message | |
| Connect button (if present) | click | initiates OAuth or redirects | |

## Phase 8 — Treasury

`/dashboard/treasury`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Safe address input | paste `0x0000000000000000000000000000000000000000` | saves OR rejects with "invalid" | |
| Safe address input | paste a valid-looking 0x... | saves, shows in active list | |
| Chain dropdown | change to ethereum | persists on reload | |
| Already-saved Safe (if any) | click "Deactivate" or similar | deactivates the row | |
| Reload | check | persisted state matches | |

## Phase 9 — Leaderboard / handle claim

`/dashboard/leaderboard/join`:

| State | Verdict |
|---|---|
| If user is unverified student: page shows "Verify your student status first" gate | 🔒 GATED |
| If verified: handle input + claim form is visible | exercise it: |
| Type `testhandle` + submit | saves; reload shows the same handle | |
| Type `bad handle!` (with space + bang) | client-side validation rejects | |
| Type `ABC` (3 chars, ok) | accepts | |
| Type `ab` (2 chars, too short) | rejects | |

## Phase 10 — Billing + credits ⏭️ SKIP STRIPE BUTTONS

The Chrome agent has visibility problems with Stripe-hosted pages —
clicks register but the redirect target won't render legibly. **DO NOT
click any upgrade or buy-credits button.** Just verify the pages render
and the buttons exist.

`/dashboard/billing`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Page renders | navigate | tier cards visible, current-plan banner correct | |
| Pro / Elite buttons | look only — do not click | buttons present and not disabled | |
| Business / Fraternity buttons | look | correctly disabled for individual accounts | |
| Manage subscription button | look | only visible if subscribed | |

`/dashboard/billing/credits`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Page renders | navigate | 4 credit pack cards (10/25/100/500) visible | |
| Current balance display | check | shows numeric balance, defaults to 0 for new user | |
| Buy buttons | look only — do not click | buttons present | |

## Phase 11 — Markets list + market detail

`/markets` (or `/dashboard/markets` — note which one is canonical):

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Category filter chips | click each | list filters | |
| Sort by volume / time | click | re-orders | |
| Per-book freshness strip | hover | tooltip with last write time | |
| Search by question text | type | results narrow | |
| Click any market row | click | navigates to /dashboard/markets/[plat]/[id] without 404 | |
| Click a Kalshi market | check detail page | renders fully | |
| Click a Polymarket market | check detail page | renders | |
| Click an OG market | check detail page | renders | |

`/dashboard/markets/[platform]/[id]` (any one):

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Breadcrumb | click parent | returns to /markets | |
| Timeframe tabs (5m / 1h / D / 1w) | click each | URL updates `?tf=`, chart re-renders | |
| Detail tabs (Positions / Orders / Buy/Sell / Trades / etc.) | click each | content area swaps | |
| Trade panel: Yes / No buttons | click | toggles which side | |
| Trade panel: amount input | type a number | total updates | |
| Trade panel: BUY button | click | "wallet not connected" OR places order if wallet linked | |
| Cross-book table | check | shows all venues that quote this market | |

## Phase 12 — Minute Markets (live ladder)

`/dashboard/minute`:

| Element | Action | Expected | Verdict |
|---|---|---|---|
| Group cards | look | each has asset + "resolves in" countdown ticking down | |
| Auto-refresh badge | watch for 30s | refreshes / countdown updates | |
| `?within=30` | navigate | shows only groups resolving within 30 min | |
| `?within=5` | navigate | shows only groups resolving within 5 min | |
| `?asset=BTC` | navigate | filters to BTC only | |
| Click any strike row | click | navigates to /dashboard/markets/[plat]/[id] | |

## Phase 13 — Alerts

`/dashboard/alerts`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| "Create rule" button | click | routes to /dashboard/alerts/new (or upgrade gate for free tier) | |
| Existing rules table | look | empty for new user | |
| Settings link | click | routes to /dashboard/alerts/settings | |

`/dashboard/alerts/new` (if not gated):

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Trigger type dropdown | pick "price crosses" | form fields appear | |
| Market filter | type "kalshi" | results narrow | |
| Save | click | rule appears in /dashboard/alerts list | |
| Test notification | click | push permission prompt OR test email sent | |

`/dashboard/alerts/settings`:

| Control | Action | Expected | Verdict |
|---|---|---|---|
| Browser push toggle | flip on | browser asks for notification permission | |
| Email toggle | flip on | persists | |
| Quiet hours toggle | enable + set | persists | |
| Send test notification | click | actually triggers a test push/email | |

🟡 If browser push fails because `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is unset
in dev, mark as PLACEHOLDER (not BROKEN).

## Phase 14 — Sign-out + return

In any tab:
1. Find the sign-out option (avatar dropdown or settings).
2. Click sign out → redirects to `/` or `/login`.
3. Visit `/dashboard` directly → should redirect to /signup or /login.
4. Sign back in via `/login` (request a new magic link, click it).
5. Land back on /dashboard. Verify:
   - O'Toole sidebar history is fresh (or persisted? note which)
   - Account-type / api-keys / etc. settings persisted
   - Profile counts (referrals etc.) correct

## Phase 15 — Console / network errors collected

Throughout all phases:
- Browser devtools Console: list every red error with the route that triggered it.
- `npm run dev` terminal: list any error stacks (not just info logs).
- Network tab: list any 4xx (except expected 401/403) or 5xx responses.

---

## Final report

Per-area summary table:

| Area | ✅ Works | 🔧 Broken | 🟡 Placeholder | 🔒 Gated | ⏭️ Skip |
|---|---|---|---|---|---|
| Header / nav | | | | | |
| Dashboard main | | | | | |
| Profile | | | | | |
| Settings | | | | | |
| O'Toole | | | | | |
| Connections | | | | | |
| Treasury | | | | | |
| Leaderboard | | | | | |
| Billing | | | | | |
| Markets | | | | | |
| Minute | | | | | |
| Alerts | | | | | |
| Sign-out cycle | | | | | |

Then for each 🔧 BROKEN row, give:
- the page URL
- the action that triggered it
- the symptom (error text, console error, silent no-op, etc.)

Target total length: under 60 lines including the table. Screenshot only
on FAILs.

## Boundaries

- Localhost only. Don't actually pay through Stripe — back-button out of
  every checkout redirect.
- Don't actually submit student verification or send invites with
  reachable emails — fake/placeholder addresses only.
- If any feature requires admin tools, mark ⏭️ SKIP.
- If the dev server crashes mid-test, restart from `apps/platform/` and
  resume. Note the crash trigger.
- DO NOT click external dollar-cost actions (Stripe Pay, OAuth Authorize,
  Connect Wallet sign txn) without checking with the user first.
