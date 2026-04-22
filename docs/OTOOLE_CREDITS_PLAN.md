# O'Toole Credits + Multi-Provider Plan

What shipped today, what's still to build, ordered so each step unlocks the next.

## What's live now (committed in `feat/platform-scaffold`)

- `lib/ai-models.ts`: catalog of 9 models across 4 providers. Only the 3 Anthropic models are `enabled: true`; OpenAI/Google/xAI are stubbed but visible in the dropdown as "(soon)".
- `lib/credits.ts`: ledger-backed credit system. `getBalance`, `spendCredits`, `grantCredits`. Credit packs: $10/$25/$100/$500 with bulk bonuses.
- Migration `006_user_credits.sql`: `user_credits` (cached balance) + `credit_transactions` (append-only ledger). DB trigger maintains balance atomically.
- API route `/api/otoole/chat` now accepts a `model` param, validates tier + enabled, checks balance before Anthropic call, debits credits after success.
- Chat UI has a model dropdown (cost-per-message shown in each option), credit balance shown next to it.
- Daily-cap path (migration 005) still active for free tier / Haiku messages as a fallback when user has no credits.

## What's NOT wired yet, ordered by build priority

### 1. Stripe credit pack checkout (~1 day)

**What:** `POST /api/credits/checkout` → create Stripe Checkout Session → webhook on `checkout.session.completed` → call `grantCredits(userId, pack.credits, 'purchase', {stripeChargeId})`.

**Files to create:**
- `/api/credits/checkout/route.ts` — create-session endpoint, reads pack id from body, returns hosted-checkout URL
- `/api/credits/webhook/route.ts` — Stripe signature verification, handles `checkout.session.completed` + `refund` events
- `/dashboard/billing/page.tsx` — shows CREDIT_PACKS with buy buttons, current balance, recent transactions
- `/dashboard/billing/credit-pack-button.tsx` — client component that POSTs to checkout + redirects

**Env needed:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SIGNING_SECRET`, `STRIPE_PUBLISHABLE_KEY`.

**Dependencies:** subscriptions table from the Stripe integration the other Claude is doing. Credits are PAY-PER-USE and stackable with subscriptions; both coexist.

### 2. OpenAI / Google / xAI adapters (~1 day for all three)

**What:** per-provider adapter that takes the common chat input (messages + system prompt) and returns common output (text + token counts). Enables the "(soon)" models in the dropdown.

**Approach:** lib/ai-providers/ with one file per provider:
- `anthropic.ts` (existing logic extracted)
- `openai.ts` — wraps `openai` SDK, handles their cache-control differences
- `google.ts` — `@google/generative-ai` SDK
- `xai.ts` — xAI's OpenAI-compatible endpoint

**API route change:** `switch (model.provider)` routing instead of hardcoded Anthropic call.

**Env needed:** `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `XAI_API_KEY`.

**Caveat:** each provider's caching semantics differ. Anthropic's prompt caching is easy; OpenAI needs Azure for cache; Google's is different again. Treat the ~10× cost savings from Anthropic caching as baseline; other providers will be more expensive per equivalent message, so `creditCostPerMessage` in ai-models.ts should reflect that.

### 3. BYO API key (~half day, user-controlled cost)

**What:** user supplies their own `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in settings. Sneakers uses it to call the provider, doesn't debit credits, doesn't charge the user.

**Why users want it:** some customers have pre-negotiated rates with providers, or already pay their own bill, or want to keep their prompts off Sneakers' org. BYO key = zero marginal cost to them past our platform subscription.

**Data model:** new Supabase table `user_provider_keys` (user_id, provider, encrypted_key, verified_at). Keys encrypted at rest with `SUPABASE_ENCRYPTION_KEY` or similar KMS. NEVER log, NEVER return to the client after save (write-only from the UI).

**Route change:** if user has a BYO key for the selected model's provider, use it instead of Sneakers' key and skip `spendCredits`. Still log usage + token counts for user's own tracking.

**Security:** keys stored encrypted; only decrypted in the API route at call time; retry/error paths must never echo the key back.

### 4. Credit transaction history UI (~half day)

**What:** `/dashboard/billing` page shows:
- Current balance + recent 30-day spend
- Transaction ledger (date, kind, delta, model, description)
- Upcoming low-balance warnings
- Auto-refill settings (future — "top up $25 when balance drops below 1000 credits")

Pure SELECTs on `credit_transactions` with user-scoped RLS; no new backend.

### 5. Cross-site O'Toole tracking (~1 week — biggest build)

This is the "O'Toole will allow users to go through the site and track all of the data" piece the user called out. Bigger product surface than the chat widget alone.

**What:** O'Toole becomes a persistent agent that:
- Knows which page the user is on (market detail, dashboard, etc.)
- Has access to the user's watchlist, recent market views, portfolio (if Polygon wallet connects)
- Can answer context-aware questions: "what's the overround on THIS market?" where "this" = the market currently viewed
- Proactively surfaces: "this market's overround just spiked to 108% — worth a look?"
- Logs telemetry: pages viewed, markets clicked, model preferences, prompts (for the user's own audit trail, not for sharing)

**Components needed:**
- `/lib/telemetry.ts` — event logger that POSTs to `/api/telemetry` with page_view, market_view, watchlist_add, etc.
- Migration `007_user_telemetry.sql` — `user_events` time-series table, RLS scoped to auth.uid()
- Floating O'Toole widget on every authenticated page (not just `/dashboard`) — reads current page context via the React component tree
- Context injection in system prompt: "User is currently viewing market ID X. Their recent watchlist adds are …."
- Proactive alerts: server-side job that scans telemetry + market data, surfaces "things you'd care about" via a notifications bell

**Cost implication:** proactive analysis = continuous AI calls even when the user isn't chatting. Needs a separate credit bucket or a higher-tier-only feature.

## Pricing model, end state

| What | Cost |
|---|---|
| Free tier | 5 Haiku msgs/day, no credits, no premium models |
| Pay-as-you-go | $10/$25/$100/$500 credit packs with bulk bonuses. 1 credit ≈ $0.001 pre-margin |
| Pro subscription | $25/mo: Sonnet unlocked, 100 free Sonnet msgs included, overage from credits |
| Elite subscription | $99/mo: Opus unlocked, 50 free Opus msgs + 500 Sonnet, overage from credits, proactive alerts on |
| Business subscription | $299/mo: unlimited + BYO key + team seats + priority model routing |

Numbers are starting positions — tune after 100 testers, not before.

## What O'Toole persona should say about itself

When a user asks "how much do you cost?", O'Toole should answer transparently:
- "The model you're using (X) costs Y credits per message"
- "Your balance is Z"
- "The free tier gets 5 Haiku messages daily; paid models are pay-as-you-go or subscription"

This is a guardrail update, not new code. Add to the OTOOLE_PERSONA string once pricing finalizes.

## Handoff to Stripe integration session

The other Claude is already working on Stripe subscriptions (`docs/HANDOFF_STRIPE_SUBSCRIPTIONS.md`). **Credits are orthogonal to subscriptions.** Both should coexist:
- Subscription unlocks tier (view modes, which models, free included allowances)
- Credits are pay-as-you-go overage on top of (or instead of) subscription

When that Stripe work lands, swap `resolveTier` in `otoole-usage.ts` to read the subscriptions table. No other code changes needed for credits to work alongside.

## To-dos in priority order

1. Apply migration 006 to Supabase (SQL editor, same flow as 004/005)
2. Set `ANTHROPIC_API_KEY` in Vercel env so O'Toole stops returning the "I'm offline" stub
3. Once Stripe checkout lands: wire `grantCredits` into the checkout webhook
4. Add BYO-API-key settings page
5. Add OpenAI/Google/xAI adapters (unblocks all the "(soon)" models)
6. Ship cross-site O'Toole tracking (biggest leverage, biggest scope)
