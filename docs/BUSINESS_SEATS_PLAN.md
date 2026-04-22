# Business Seats — Plan (not yet implemented)

The commercial / enterprise / data-license side of Sneakers. Distinct from the consumer Pro tier plan in `docs/PAYMENT_PARTNERS.md`. Nothing in this doc is wired up yet — this is the starting point for when we're ready to sell to non-retail customers.

## Who actually buys this

Ranked by fit × likely deal size:

### 1. Handicapper / tout brands (best early fit, $500–2k/mo)
Brands like WINDAILY-adjacent — people selling picks, running betting content, Discords, newsletters. They need:
- Aggregated prices across books to highlight value
- Historical line movement to build narratives ("Lakers line moved 2 pts since this morning")
- Limited-use API for building widgets + charts
- **Not** real-time institutional latency

Low friction to sell — many are already in your WINDAILY orbit. Their monthly revenue is bettor-subscription driven, so $500–2k for data is justified if it sharpens their edge.

### 2. DFS / pickem content creators ($1k–5k/mo)
Similar profile, slightly bigger. People running YouTube channels, Substacks, TikTok content on DFS. They want:
- PrizePicks + Underdog line movement history
- Comparison of DFS lines vs sportsbook consensus (to find +EV picks for their audience)
- Daily reports, exportable for content

### 3. Small sharps / pro bettors ($200–1k/mo, high volume)
Individuals running their own models. Each pays less, but there are many. Competitive with OddsJam's $100–500/mo tiers.
- Real-time arb alerts
- Custom filters (e.g., "alert me when PrizePicks deviates from DK by >2 pts on NBA player points")
- Historical data for backtesting
- Delivery via webhook or push notification matters to them

### 4. Content publishers / media (inbound, $5–25k/year)
Think SI, The Athletic, OddsShark, ActionNetwork. They license data to embed widgets on their site. Custom contracts, often annual.

### 5. Small quant funds / research groups ($10–50k/year)
Hedge funds who've added prediction markets to their strategy stack. Very demanding — want raw tick data, Parquet dumps, reliable SLA, API keys, usage metering.

### 6. Tier-1 operators / exchanges (inbound, $50k–500k/year)
Kalshi, Polymarket, DK, FD buying Sneakers data for line-setting or market-making operations. Low probability near-term but high-value if it happens. **Don't prospect cold — inbound only.**

### 7. Academic researchers (free or $500/mo academic tier)
Professors studying prediction market efficiency. Low revenue but great PR + citations.

## Pricing tiers — starting shape

| Tier | Monthly | Included | Use case |
|---|---|---|---|
| **Individual** | $99 | 10k API req/mo, 30d history, REST only | Solo sharps |
| **Studio** | $500 | 100k req/mo, 90d history, JSON+CSV export, 1 webhook | Tout brands, content creators |
| **Pro** | $2k | 500k req/mo, 1y history, Parquet dumps, 5 webhooks, Slack support | DFS studios, small funds |
| **Enterprise** | $10k+ | unlimited, full history, SLA, dedicated engineer | Media, hedge funds, operators |
| **Academic** | $50 | 50k req/mo, anonymized only, no commercial use | Researchers |

Numbers are starting guesses. Adjust after 10 real conversations — nothing calibrates pricing faster.

## What we actually sell

- **Real-time aggregated prices** across 7 books (the scrapers + Odds API we've built)
- **Historical line movement** per market, per book, at 1-minute resolution (once Timescale is live)
- **Arb / EV alerts** — not "here's an arb" but "here's a market where two books diverged N% in the last 15 minutes"
- **Cross-book normalization** — same market on DK, FD, NoVig, Polymarket surfaced with a unified event_key so customer queries are clean
- **Odds history dumps** — monthly Parquet exports for customers who want to build their own models

## What we're *not* selling (important to be explicit)

- Not selling betting picks / "consensus sharp action" signals. That's a different product.
- Not selling account-level user data. Everything is market-side.
- Not selling Kalshi/Polymarket contract resolutions — we report, we don't arbitrate.
- Not guaranteed arbs — we surface candidates, customers execute at their own risk.

## The sales motion by phase

### Phase 1 — Inbound-only landing page (post 100-testers, ~2 weeks after first Pro launch)

- `/enterprise` or `/data-license` page on the site
- "Contact sales" form routes to an email alias
- No pricing shown publicly; each deal hand-quoted
- Handle all inbound personally (Jackson / you), ~1 hr per call

### Phase 2 — Individual + Studio tiers self-serve (~month 3)

- Stripe subscription for the $99 and $500 tiers
- API key issuance in a self-serve dashboard
- Usage metering via Upstash or Stripe's usage-based billing
- Documentation site (`docs.sneakersterminal.com`)

### Phase 3 — Outbound motion to handicappers (~month 4)

- Cold email list: 200 WINDAILY-adjacent brands, DFS content creators, sharps with public followings
- 20-minute demo → 14-day trial → paid conversion
- Target: 5 Studio tier closes in a quarter = $2.5k MRR

### Phase 4 — Enterprise dedicated sales (only if revenue justifies, month 9+)

- Hire a BDR or fractional sales contractor
- Target list: media brands, CFTC research groups, small funds
- Custom contracts with SLAs, indemnification, data residency clauses

## Technical requirements to sell this

Ordered by build priority:

1. **Timescale live** — non-negotiable. Without time-series storage, there's no history product.
2. **API key issuance** — admin dashboard panel, per-key rate limits, revocation.
3. **Usage metering** — Upstash counters or Stripe usage records. Bills tie to actual requests.
4. **Historical endpoints** — `/v1/historical/markets/:id?from=:ts&to=:ts` returning JSON or NDJSON.
5. **Webhook delivery** — subscribe-to-arbs and subscribe-to-market-move flows. HMAC-signed.
6. **Parquet nightly dumps** — scheduled job writes `s3://sneakers-data/YYYY-MM-DD/*.parquet`, pre-signed URLs shared with Pro+ customers.
7. **Docs site** — OpenAPI spec + interactive playground. Stripe does this well, as reference.
8. **Status page** — `status.sneakersterminal.com` for uptime + incident history. Table-stakes for enterprise.
9. **SDK(s)** — Node and Python clients at minimum. Optional but dramatically accelerates sales once you have 5+ customers.

Rough effort: 2-3 weeks of focused engineering once Timescale is up and Pro consumer tier is live.

## Legal must-haves before charging money

- **Data License Agreement (DLA)** — terms governing what customers can do with the data (no resale, no derived products that compete with Sneakers, usage monitoring rights). ~$2-5k for a lawyer to draft.
- **Indemnification language** — critical. If a customer loses money because our data was wrong / stale / missing, we are not liable. This must be explicit in every tier's ToS.
- **SLA template** — for Pro+ tiers: 99.5% uptime, 5-min max latency on real-time feeds, credits for SLA misses.
- **Data source compliance** — we need to be able to credibly say our upstream data is properly licensed. Odds API covers sportsbooks; our direct scraping of prediction markets needs its own ToS review before we resell.
- **ToS for the website's affiliate click-through** — distinct from data license. Clarifies that clicks through Sneakers' venue buttons aren't guaranteed arb execution.
- **GDPR / CCPA posture** — even if customers are businesses, we'll have some personal data (contact, billing). Keep Supabase's built-in posture for consumer; formalize for business.

## Revenue model — rough math

Conservative 12-month outlook post-launch:

| Tier | Target customers (Mo 12) | Monthly | MRR |
|---|---|---|---|
| Individual | 50 | $99 | $4,950 |
| Studio | 15 | $500 | $7,500 |
| Pro | 4 | $2,000 | $8,000 |
| Enterprise | 2 | $10,000 | $20,000 |
| **Total** | 71 | | **$40,450 MRR / ~$485k ARR** |

For context, OddsJam (US market leader) reportedly does ~$15-30M ARR. A $500k ARR business-data product at month 12 is realistic if the data is distinctive and the sales motion is tight. Most of the challenge is lead gen and product differentiation, not technology.

## Open questions worth resolving before launch

1. **Exclusivity / non-compete terms.** When a Studio-tier customer wants exclusive data for their vertical, say no (undermines scaling) or say yes at 10× price?
2. **Kalshi / Polymarket relationship.** If they notice us aggregating + reselling their contract data, what's the response? Could be partnership (data-feed agreement) or C&D. Worth proactively approaching before launching the B2B product.
3. **Data freshness vs cost.** Enterprise customers want real-time; the cost of polling Odds API every second is prohibitive on dev tier. Will need to figure out upstream costs per tier.
4. **Geographic restrictions.** Some data sources restrict international resale. Affects which customers we can sell to.
5. **White-labeling.** Do we allow enterprise customers to build their own branded product on top of our data? That's a much bigger contract but requires more legal + technical scaffolding (per-tenant API keys, branded webhooks, isolated data partitions).

## What to do first

**Nothing yet.** This is the plan for when the retail Pro tier is launched + validated (per `docs/PAYMENT_PARTNERS.md`). Until then, no business seats work.

**First real step** (~month 2 post-launch): put up a `/enterprise` landing page with "Contact sales" form. Zero engineering required. See if inbound comes.

**If inbound arrives:** take 3-5 calls, learn what they actually want, THEN start building the technical scaffolding. Don't build before you know the real shape of demand.
