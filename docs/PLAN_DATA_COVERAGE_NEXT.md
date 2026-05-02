# Sneakers — Data coverage plan

Drafted 2026-05-02 from a deep-dive into the current scraper architecture
plus web research into ProphetX + OG/CDNA API surface. The user's prompt
("deep dive into adding other markets like on ProphetX and OG") turned out
to read three different ways once the codebase was inspected — this doc
covers all three so you can pick when you wake up.

---

## TL;DR

1. **Both ProphetX and OG already have working scrapers** that produce rows
   to Postgres + JSONL. They're live in the dashboard, in `lib/venues.ts`,
   and in O'Toole's persona. Discovery from this exercise: the user may
   have forgotten this, or may have meant "other platforms *like* those."
2. **Both current implementations are grey-zone**, not durable:
   - **ProphetX** scraper uses a `PROPHETX_BEARER_TOKEN` JWT manually
     captured from a logged-in browser session. JWTs expire. Silent breakage.
   - **OG** scraper hits an undocumented internal endpoint
     (`og.com/api/proxy/public/knock-out/...`). OG is owned by Crypto.com
     and lists on CDNA (CFTC-regulated). Scraping is TOS-prohibited and
     potentially CFTC-data-license-fragile. It will break — the only
     question is when, and whether it breaks loud or quiet.
3. **ProphetX has a clean upgrade path.** They run a documented developer
   hub (`docs.prophetx.co`) with four partner tiers: Affiliate, Market
   Maker, Parlay, ISV. Apply for ISV — the right long-term home for an
   aggregator like Sneakers. Migrate from JWT-in-env to issued API key.
4. **OG has no clean path.** Crypto.com's official Predictions Partners
   program targets *operators* (Fanatics, Hollywood, Underdog Predictions),
   not aggregators. No reseller currently carries OG. **Recommendation:
   defer hardening for 60–90 days** — by then OpticOdds or OddsJam will
   likely cut a deal with CDNA and Sneakers can license through them, or
   Sneakers will have the operator-relationship leverage to cold-pitch
   Crypto.com directly.
5. **The "other markets" reading.** Of the venues catalog entries that
   aren't yet `live`, four are immediately tractable: Underdog
   Predictions, PrizePicks, Sporttrade, and Opinion (which already has
   a coded scraper marked "coming soon"). Underdog Predictions is the
   biggest single win — it routes through the same CDNA backend as OG,
   so a CDNA partner deal would unlock both at once.

---

## 1. Current state — what's actually wired

From the codebase (full detail in the research transcript at
`/private/tmp/.../tasks/a62fc5823e2149c48.output`):

```
apps/trader/src/scrapers/
  ├─ polymarket/   233 LOC  Live   public REST, no auth
  ├─ kalshi/       251 LOC  Live   public REST, no auth
  ├─ prophetx/     352 LOC  Live   *requires PROPHETX_BEARER_TOKEN (JWT)*
  ├─ og/           296 LOC  Live   undocumented /api/proxy/... endpoint, no auth
  ├─ novig/        472 LOC  Live   public REST, no auth
  ├─ limitless/    198 LOC  Live   public REST, no auth
  ├─ oddsapi/      343 LOC  Live   API key (the-odds-api.com) — sportsbook coverage
  ├─ opinion/      239 LOC  Coming soon
  ├─ prizepicks/   304 LOC  Coming soon
  ├─ underdog/     332 LOC  Coming soon
  └─ dkpredictions/227 LOC  Coming soon
```

All scrapers share the canonical `MarketSnapshot` shape from
`apps/trader/src/scrapers/types.ts`: platform, platform_market_id, question,
tags, sport, outcomes[], overround, volume_traded, liquidity, starts_at,
resolves_at, phase, ts. They dual-write JSONL + Postgres via
`utils/db-write.ts → syncSnapshotsToDb`. Read path on the platform side is
`apps/platform/src/lib/markets-data.ts → loadAllLatestSnapshots()` which
prefers DB and falls back to JSONL on disk.

### ProphetX — the JWT-in-env problem

`apps/trader/src/scrapers/prophetx/scrape.ts:41` requires
`process.env.PROPHETX_BEARER_TOKEN`. The throw message says verbatim:

> "(Capture it from your ProphetX session, Network tab, any request's
> Authorization header.)"

That's a session token. Three problems:
- **Expiry**: JWTs typically TTL out in hours-to-days. When it does, the
  scraper 401s and we lose the data with no alert (the dashboard's
  "freshness" pill is the only indicator).
- **Account binding**: the token is scoped to a specific user account —
  scraping at scale will eventually trip rate limits or get the account
  flagged.
- **TOS exposure**: ProphetX's Terms of Use prohibit "automated means"
  without permission. A bearer token from a normal user account is not
  permission. This is functionally fine while we're a small project but
  becomes a liability the moment we have meaningful users.

### OG — the undocumented-endpoint problem

`apps/trader/src/scrapers/og/scrape.ts` hits
`https://og.com/api/proxy/public/knock-out/og/public/api/v1`. This is the
internal endpoint the OG consumer app's frontend uses, not a documented
public API. Three problems compound:
- **No SLA**: the endpoint can change, get auth-gated, or move behind
  Cloudflare any deploy. Expect quiet breakage every 4–8 weeks.
- **TOS**: same automated-access prohibition as ProphetX, plus CDNA's
  market-data-license framework which is materially stricter than
  state-regulated sweepstakes books.
- **Brand/legal risk**: OG is owned by Crypto.com. They are well-funded
  enough to send a cease-and-desist if they notice us redistributing
  their odds without a partner deal.

Independent confirmation from web research: AgentBets' prediction-market
API reference *explicitly* lists OG.com as having "no public API or SDK
for programmatic trading." PredictionHunt's unified prediction-market
API covers Polymarket / Kalshi / PredictIt / ProphetX / Opinion.trade —
notably NOT OG.

---

## 2. Three paths — pick one (or sequence them)

### Path A — Harden ProphetX via official API (recommended, ~1–2 sprints)

1. **Apply for Affiliate API access** at
   `docs.prophetx.co/docs/copy-of-requesting-api-access`. Free tier;
   open to "all users" per BettingUSA's review. Sandbox first, then
   apply for Production.
2. **Plan to graduate to the ISV tier.** ISV (Independent Software
   Vendor) is the right long-term home for an aggregator-class consumer
   of ProphetX data. The Affiliate tier is for "users wanting a first
   look" — fine for prototyping but the ISV tier is where the
   redistribution-OK partnership terms live.
3. **Get redistribution explicitly approved in writing.** The TOS
   prohibits redistribution by default. Standard for partner agreements
   to carve this out for ISV / aggregator use. Confirm before going live.
4. **Migrate the scraper.** Swap `PROPHETX_BEARER_TOKEN` (session JWT)
   for an issued long-lived API key. Add a 401 → alert path so silent
   token failures stop being silent. Wire WebSocket integration if we
   want sub-minute freshness on top markets.
5. **Update OTOOLE_PERSONA's footnote.** Currently says ProphetX takes
   "1-2% commission" — confirm against current docs (some sources
   suggest 1-3% on moneyline/spread/totals, 0% on props/derivatives).

**Effort**: 1 sprint of code work + 1–2 weeks waiting on ProphetX's
production approval gate (similar to CDNA-style conformance testing).

### Path B — Defer OG hardening (recommended)

1. **Do nothing to the scraper short-term.** Accept the breakage risk
   in exchange for current coverage. The cost of a few lost-data days
   is lower than the cost of negotiating a CDNA partner agreement.
2. **Add a "this scraper may break" comment** at the top of
   `og/scrape.ts` flagging the undocumented-endpoint reality so the
   next person reading the file understands the trade-off.
3. **Add a 4xx/5xx → admin-alert path** so silent breakage becomes
   surfaced. The scraper currently has retry logic but no escalation.
4. **Set a 60-day reminder to re-evaluate.** By 2026-07-01, check
   whether OpticOdds, OddsJam Datafeed, or PredictionData.io has added
   OG/CDNA coverage. If yes — license from them and replace the direct
   scraper. If no — either accept continued risk or initiate a cold
   pitch to `crypto.com/en/prediction/partners`.
5. **Optional aggressive play**: cold-pitch Crypto.com for a
   "data display partnership" (inventory-only, no execution flow).
   Worst case they say no. Best case they want a Sneakers brand on
   their marketing page in exchange for clean data.

**Effort**: ~2 hours of comment/alert work today; revisit calendar entry
in 60 days.

### Path C — Add new platforms (if "other markets like ProphetX/OG" is the real ask)

The four next-up candidates, ranked by impact-per-effort:

| Platform | Status today | Effort | Why next |
|---|---|---|---|
| **Underdog Predictions** | Scraper coded but `coming_soon` | ~1 day | Routes through same CDNA backend as OG. Any future CDNA partner deal unlocks both. Underdog has strong consumer brand among college-age bettors — exactly Sneakers' target demo. |
| **PrizePicks** | Scraper coded but `coming_soon` | ~1 day | Largest DFS pick'em in the US by user count. The catalog is wide but shallow (single-game player props). Big freshness expectation. |
| **Opinion.trade** | Scraper coded but `coming_soon` | ~½ day | Per existing memory `reference_opinion_api_access.md`, API key requires sending <0.1 USDT on BNB Chain to a contract address + creating an in-app contract wallet. Annoying but documented. Adds prediction-market depth. |
| **Sporttrade** | Not started | ~1 sprint | Commission sportsbook (FL only ATM). Public REST API. Smaller market but fits the OddsJam-superset thesis. |

For each, the "what to touch" list is:

```
1. apps/trader/src/scrapers/<platform>/scrape.ts
   - Implement scrape* function returning MarketSnapshot[]
   - Apply the time-to-close phase pattern (memory:
     project_scraper_phase_bug_pattern.md)
   - syncSnapshotsToDb in main()

2. apps/trader/package.json
   - Add scrape:<platform> script

3. apps/platform/src/lib/venues.ts
   - Set status='live' (was 'coming_soon')

4. apps/platform/src/lib/markets-data.ts
   - Add to SUPPORTED_PLATFORMS tuple

5. apps/platform/src/app/dashboard/platform-logo.tsx
   - Logo path + brand color

6. apps/platform/src/app/dashboard/market-icon.tsx
   - Icon-letter case

7. apps/platform/src/app/dashboard/apps-bar.tsx
   - Optional: add to FEATURED_IDS

8. apps/platform/src/app/dashboard/alerts/rule-form.tsx
   - Add to PLATFORMS const so users can scope alerts

9. apps/platform/src/lib/otoole-tools.ts
   - Update tool description strings if they enumerate platforms
```

For Underdog + PrizePicks specifically, the scrapers are already coded
to "coming soon" status — this means the heavy lift is already done. The
remaining work is: validate the scraper still works against current API,
flip status to `live`, smoke-test the dashboard.

---

## 3. Recommended sequencing

If the real ask is "add other markets":

1. **This week**: ship Underdog + PrizePicks. Both have coded scrapers
   already. Probably 2 days of validation + finalization work.
2. **Next week**: ship Opinion.trade if user is willing to deal with
   the BNB-Chain API-key dance.
3. **In parallel**: apply for ProphetX ISV API to harden the existing
   integration. ~2 weeks elapsed, low day-to-day attention required.
4. **Within 60 days**: re-evaluate OG situation; either license through
   a reseller or cold-pitch Crypto.com Predictions Partners.

If the real ask is "harden what we have":

1. **This week**: ProphetX Affiliate API application. Add OG-scraper
   alert + comment. Total effort ~½ day of code.
2. **2 weeks out**: ProphetX Production approval likely lands. Migrate
   scraper to API-key auth.
3. **60-day mark**: OG re-evaluation.

---

## 4. Risks

- **ProphetX silent JWT expiry**: current state. Fix in Path A.
- **OG endpoint change without warning**: ongoing. Mitigation in Path B
  is alerting, not prevention.
- **TOS escalation from either platform** if they audit our public
  surface and see their odds redistributed without a partner deal.
  Probability low while we're small; rises sharply once we cross any
  meaningful user threshold or get press coverage.
- **CFTC market-data-license question** for OG specifically. Sneakers
  is currently small enough that this is theoretical, but it's the
  same regulatory framework that governs CME/ICE feeds — redistributing
  exchange data at scale eventually triggers license obligations.
- **Underdog Predictions has the same CFTC question** (it's on CDNA
  too). Adding Underdog + OG via the same partner channel is the
  cleanest long-term answer.

---

## 5. Open questions for the user

1. Did you mean "ADD ProphetX/OG" (in which case: surprise, they're
   already there) or "MORE platforms like them" (in which case: see
   Path C)?
2. Are you willing to apply for ProphetX's official API now, or is
   the JWT-in-env workflow good enough until we have meaningful users?
3. Do you have any existing relationship with Crypto.com / Underdog /
   anyone in that orbit that could shortcut a CDNA partner deal?
4. Comfort level with Opinion.trade's "send 0.1 USDT to a contract
   address" API-key onboarding? If yes, it's the cheapest non-CDNA
   prediction-market add.

---

## Appendix — research transcripts

- Codebase recon (Explore agent): `/private/tmp/claude-501/-Users-jeremyalbus/f8e2b8a9-820c-457a-a3b1-cef974fbe9e8/tasks/a62fc5823e2149c48.output`
- Web research (general-purpose agent): `/private/tmp/claude-501/-Users-jeremyalbus/f8e2b8a9-820c-457a-a3b1-cef974fbe9e8/tasks/a2425418956291514.output`
- ProphetX developer hub: <https://docs.prophetx.co/>
- ProphetX Affiliate Swagger: <https://partner-docs.prophetx.co/swagger/affiliate/index.html>
- Crypto.com Predictions Partners: <https://crypto.com/en/prediction/partners>
- AgentBets prediction-market API reference: <https://agentbets.ai/guides/prediction-market-api-reference/>
