# Bring-Your-Own Modeling — Plan (not yet implemented)

A premium-tier product where business customers plug their own data sources into Sneakers' AI-powered analysis engine and build custom models on top of our aggregated market data. Differentiates Sneakers from "raw data license" competitors (OddsJam, OpticOdds) by offering **infrastructure + AI tooling**, not just data.

## The pitch in one sentence

**"Your proprietary signals + our normalized 7-book market data + AI-powered analysis = your own branded betting model, without hiring a data engineering team."**

## Who buys this

Fits Studio+, Pro, and Enterprise tiers from `docs/BUSINESS_SEATS_PLAN.md`:

- **Content creators / sharps** with a proprietary edge (injury contacts, sharp-action network, CLV tracking) who want to turn it into a productized model.
- **Tout brands** wanting to give their subscribers a "branded picks feed" powered by their own signals rather than generic sharp consensus.
- **Small funds** running quant strategies who need to prototype quickly before committing to in-house infra.
- **Media brands** who want an embedded betting widget that reflects their own editorial lens.

## What customers actually do

Three-step flow:

### 1. Push signals into Sneakers
- Customer POSTs their proprietary data to `/v1/byo/signals/:channel` (HMAC-signed webhook in).
- Signals are arbitrary JSON: injury_report, sharp_action_score, weather, twitter_sentiment, their own line-prediction model output, anything.
- We store in a per-tenant partition with retention matching their tier.

### 2. Define a model / filter via prompt-template
- Customer defines a prompt template in their dashboard, e.g.:
  ```
  Given this NBA game:
    - Current DK moneyline: {market.draftkings.home_ask} / {market.draftkings.away_ask}
    - Current NoVig moneyline: {market.novig.home_ask} / {market.novig.away_ask}
    - My injury report: {signals.injury_report}
    - My sharp action score: {signals.sharp_action_score}

  Is this a +EV bet on either side? Format: side, confidence 0-1, reasoning.
  ```
- Template is validated for prompt-injection safety on save.
- Customer can version templates, A/B test, backtest against history.

### 3. Subscribe the template to a market stream
- Template fires on: every market update, on a schedule, on conditional trigger (e.g., "when overround changes >2pp")
- AI analyzes each firing, returns structured result
- Result is stored, queryable via API, and can push to the customer's webhook for downstream use (their Discord, Slack, user app, etc.)

## The AI layer

### Model routing

| Template complexity | Model used | Per-run cost |
|---|---|---|
| Simple filter / yes-no | Claude Haiku 4.5 | ~$0.001 |
| Standard analysis | Claude Sonnet 4.6 | ~$0.01 |
| Complex reasoning / multi-market | Claude Opus 4.7 | ~$0.10 |

Default routing is automatic based on template length + structured output requirements. Customer can override per-template (pay more for smarter model).

### Prompt caching

Anthropic's prompt caching is load-bearing for unit economics:
- Market data + template structure = stable across runs → cached
- Only the variable signal + latest prices differ → uncached portion is small
- ~10× cost reduction vs uncached on typical templates

### Cost pass-through

- Customer sees token consumption per run in their dashboard
- Billed at our cost × (1 + margin) — e.g., 20% markup on raw Anthropic token cost
- Included allowance per tier:
  - Studio ($500/mo): 2M tokens/mo (~200 Sonnet runs, or 2k Haiku runs)
  - Pro ($2k/mo): 10M tokens/mo
  - Enterprise ($10k+/mo): negotiated, usually 50M+

### Safety / guardrails

- Prompt-injection filter on customer templates at save time (scan for common escape patterns)
- Rate limits per template (max N runs/hour)
- Max token cap per run (e.g., 4k output tokens) — prevents runaway costs
- PII redaction on signals before they hit the AI (customer can opt out with enterprise agreement)
- Model response validation: JSON-schema check on structured outputs; fail-closed if malformed

## What's in the dashboard (customer-facing)

- **Signal channels**: list of their registered data streams with last-receive time + volume
- **Templates**: editor with syntax highlighting, variable autocomplete from their signals + Sneakers market data, test-run button
- **Runs**: history of template executions with input signals, prompt sent, AI response, token usage, latency
- **Deliveries**: configure where results go (webhook URL, email digest, S3 bucket)
- **Backtest**: run template against historical Sneakers market data + their signal history, see hypothetical P&L or hit rate

## Technical stack

- **Signal ingestion**: Next.js API route → Postgres (per-tenant table OR partitioned single table with row-level security)
- **Template engine**: simple mustache-style variable interpolation; Sneakers owns the substitution layer so customers can't inject raw prompts at will
- **AI runtime**: Anthropic SDK with caching enabled; routed through a queue (BullMQ on Redis) for rate limiting + retry; runs billed atomically
- **Delivery**: worker that consumes "run complete" events and dispatches to customer's configured destinations
- **Backtesting**: time-range query over Timescale, re-run template with historical data, aggregate outputs
- **Sandboxing**: customer-provided data never sees another tenant; Anthropic calls use separate API keys per tier to prevent cost-bleed between customers

## Dependencies (what must exist first)

1. **Timescale live** (per `packages/core/db/README.md`) — without history, no backtesting product.
2. **Retail Pro tier launched** — business features layer on top of consumer auth + billing infrastructure.
3. **Stripe subscriptions + usage metering** — needed for token cost pass-through.
4. **Anthropic API account** — production tier with prompt caching enabled; dedicated org separate from our development usage.
5. **Per-tenant data isolation in Supabase** — RLS policies or separate schemas per customer.

Rough build order once dependencies are in place: ~4 weeks of focused engineering.

## Pricing delta from base tiers

This is **premium on top of base business seat tiers**, not a replacement:

| Base tier | + BYO modeling | Total |
|---|---|---|
| Studio ($500) | +$500 | $1,000/mo |
| Pro ($2k) | +$1k | $3,000/mo |
| Enterprise ($10k) | +$3k-5k | $13-15k/mo |

Pricing reasoning: the incremental cost to us is ~15% AI tokens + some infra. The incremental value to the customer is *enormous* — they're getting a custom model they couldn't build alone. 100-200% margin on the BYO add-on is reasonable.

## Go-to-market positioning

- **Against OddsJam / OpticOdds**: "They sell you raw data. We turn your edge into a product."
- **Against DIY (building in-house)**: "Six weeks to build. $1k/mo to rent. Your choice."
- **Against generic AI tools (ChatGPT + CSV exports)**: "We're integrated. We handle the plumbing. You focus on the edge."

## Competitive moat

What makes this defensible past initial novelty:
1. **Normalized cross-book data** — not trivially replicable. Customers don't want to scrape 7 books themselves.
2. **Per-customer AI cost caching** — if we pass AI cost savings through prompt caching, we're meaningfully cheaper than customer running their own LLM calls.
3. **Historical data backtesting** — Timescale-backed time-travel is hard to replicate.
4. **Integrated webhooks + delivery** — by the time a customer has built this themselves, they've spent 6 engineering months. We sell them a month of work for $1k/mo.

Moat is moderate — a well-funded competitor could replicate in a quarter. But the product + the data + the workflow together compound.

## Risks

### Technical
- **Prompt injection** — customer writes templates that trick Claude into exfiltrating other customer data. Mitigate: per-tenant API keys, output validation, no cross-tenant context in any prompt.
- **Runaway token costs** — customer accidentally (or maliciously) burns $10k of tokens in an hour. Mitigate: hard per-template rate limits, account-level budget caps, alerts at 80% of included allowance.
- **Cache poisoning** — less relevant for this use case but worth testing; Anthropic's caching is scoped to our org.
- **Model hallucination** — customer sees "confidence: 0.91" on a bad recommendation and trusts it. Mitigate: disclaimers, require structured output with explicit uncertainty fields.

### Business
- **ToS on reselling data-derived insights** — revisit upstream data licenses when layering AI analysis on top. Odds API probably allows it; Kalshi/Polymarket unclear.
- **Overfitting customer templates** — their backtest looks great, production looks bad. Standard quant problem; we own the tooling but not the alpha.
- **Support burden** — customers will blame bad results on our AI even when their signal is noisy. Need clear "garbage in, garbage out" framing + excellent logs.

### Legal
- **Gambling recommendation liability** — if AI output is framed as "bet this side" and customer loses, who's on the hook? Plausibly us unless indemnification is airtight. ToS + structured output ("signal": confidence score, not "recommendation") is critical.
- **CFTC considerations** — if model output is sold to retail in a way that looks like advisory on prediction-market contracts, we may cross into registered-advisor territory. Get legal review before the first sale.

## Phased rollout

### Phase 1 (month 3-4 post consumer launch) — Internal dogfood
- Build the core — signal ingestion, template engine, Anthropic integration
- Sneakers' own team uses it to build internal arb alerts / EV models
- No external customers yet

### Phase 2 (month 5) — Closed beta with 3 friendly customers
- Pick 3 handicapper brands from WINDAILY orbit
- Give them 3 months free in exchange for product feedback + case studies
- Iterate on template UX, delivery reliability

### Phase 3 (month 7) — General availability
- Opens to any Studio+ tier subscriber as an add-on
- Self-serve onboarding, documentation, sample templates
- Sales collateral featuring the closed-beta case studies

### Phase 4 (month 10+) — Enterprise verticalization
- "Injury Model" template library for NFL
- "Sharp Action Model" for NBA
- Templates customers can customize rather than build from scratch
- Drives up GMV per customer

## What to do first — honest answer

**Nothing yet.** Like business seats generally, this waits until the retail consumer product is real. Until then, this is a plan document informing architecture decisions (e.g., "build Timescale in a way that supports per-tenant querying later" rather than "build BYO modeling now").

**First real step** (~month 3): internal dogfood. Build the signal ingestion + Anthropic prompt-template runner for Sneakers' own arb-finding use. When we've used it ourselves to catch 3 arbs we wouldn't have otherwise found, we know the product works.

## Open questions

1. **Anthropic vs OpenAI vs multi-model.** Anthropic's prompt caching is load-bearing for cost — if we offer OpenAI too, we lose that lever. Stay Anthropic-only for v1 unless a customer hard-requires otherwise.
2. **Template marketplace.** Do we let customers share/sell templates to each other, taking a revenue share? High-leverage network effect but adds moderation burden.
3. **Sandboxed code execution** (not just AI prompts). Some customers will want to write real Python/JS for their model, not prompt templates. Do we build a sandboxed runner (Cloudflare Workers, Modal)? Much bigger product scope — maybe Phase 5.
4. **Backtest reliability.** Historical Sneakers data is only as old as our scrapers (days, not years). For credible backtests we'd need to either (a) buy historical data from OpticOdds/OddsJam or (b) wait 6-12 months of our own scraping. Both valid; flag before promising backtest features to customers.
