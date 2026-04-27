# RoulettePredict — casino UX over real prediction-market props

Written 2026-04-27. Exploratory product sketch + onboarding plan. Not on the immediate roadmap — sits behind scrapers + 100 testers + iOS scaffold. Captured here so the idea doesn't rot in a chat transcript.

---

## The one-line pitch

A roulette board where every cell is a real prediction-market prop, sized so the cell's payout odds match the prop's implied probability. Drop a chip on **17**, you're really betting ~2.78¢ on *"Will ETH trade above $4,200 between 12:30–12:35 UTC?"* for $1 to win $35. Same mechanic for blackjack, slots, anything with implied-probability rungs.

The crucial reframe: **it is not a casino game with prediction-market settlement**. It is **36 simultaneous prop bets visualized as a roulette grid**. The events are visible, the settlement is the underlying market's settlement, and there is no RNG. That distinction is the whole regulatory posture.

---

## Round mechanic

A round is a fixed settlement window (5min / 15min / 1hr — see open decisions). Before it opens, the system assembles a **card**:

| Bet type      | Count | Implied prob target | Payout |
|---------------|-------|---------------------|--------|
| Number cells  | 36    | ~2.78%              | 35:1   |
| Dozens / cols | 3+3   | ~33%                | 2:1    |
| Red/black     | 2     | ~50%                | 1:1    |
| Even/odd      | 2     | ~50%                | 1:1    |
| 1-18 / 19-36  | 2     | ~50%                | 1:1    |

All props on a card resolve at the same scheduled time. Player drops chips, window closes, props settle, cells light up, payouts hit instantly.

Critical mechanic: **multiple cells can light or none can light per round**, unlike physical roulette where exactly one number wins. That's fine — the player only sees their own cells. UX-wise the wheel "spin" is the settlement clock ticking down, and the reveal is per-cell, not per-wheel.

---

## Reveal — the moat

After settlement, each lit cell shows a one-line "why":

> **17 hit** — *ETH printed $4,217 at 12:33:08*
> **4 hit** — *Fed minutes referenced "balance sheet"*
> **Red wins** — *BTC closed above $98K*

Casinos have no narrative. We have 36 micro-stories per round. This is the differentiator and the educational on-ramp — players who only want the chips can ignore the reveal; players who want to learn can flip every cell to see the prop.

---

## Inventory sourcing — the hard engineering

Every round needs a **prop oracle** that scans Kalshi + Polymarket + Opinion.trade + sub-hour crypto markets and bins them into the right buckets. Three honest realities:

1. **The 2.78% bucket will sometimes be short.** Solutions, in order of preference:
   - Pull from naturally long-tail events (crypto strike ladders, sports prop ladders).
   - Synthesize composite props ("BTC > $X *and* ETH > $Y") to manufacture the tail.
   - Pad with house-set props — once you do this, you're partially a bookmaker on those cells. Acceptable but tracks risk.
2. **Settlement times must align.** Easiest if the round anchors to a clock-based event (price prints at minute X, timestamps). Harder for news/event props.
3. **5–15 min rounds will be crypto/sports-clock heavy.** Hour+ rounds open up news, weather, FOMC-style props — richer inventory but less casino-feel.

The card assembler is the central piece of infrastructure. Probably belongs alongside the existing arb scanner — same scrape, different consumer.

---

## House economics — be the router, not the bookmaker

**Recommended model:**
Player puts $1 on cell 17. We buy ~2.78¢ × $36 = ~$1.00 of YES on the underlying prop. If the prop hits, the contract pays $36, we pay the player $35, we pocket the spread + a flat take rate (3–5% recommended). If the prop misses, the player loses their dollar, we lose nothing because we hedged.

This is the **router model**: we are an aggregator with a casino skin, not an operator. We don't hold settlement risk on a per-bet basis.

**When the router model breaks:**
- Synthesized composite props (no single market to lay off into) → we either skip the cell or hold the risk.
- Thin fills → cell shows "closed" rather than letting the player bet at odds we can't hedge.

**Alternative:**
Pure bookmaker — we set odds, hold all risk, hedge in aggregate. More profitable, vastly more regulatory exposure, requires actual sportsbook licensure. **Don't do this.**

---

## Regulatory posture

This is the most important section. **The wrapper is what makes or breaks legality, not the underlying.**

Kalshi's whole legal posture is "we are not gambling — we are a CFTC-regulated event-contracts exchange." If we layer a roulette UI on top of Kalshi contracts and call it "RouletteWin" or similar, we are the literal steelman for the CFTC and state AG argument that event contracts are gambling. Kalshi would have legal grounds to cut off our API access. State AGs would sue.

**The framing that keeps us safe:**
- Don't call it roulette in product copy. Call it a **prop wheel** / **probability board** / **RoulettePredict** internally and externally.
- Make the underlying event **visible by default** on every cell, not hidden behind a hover/flip. The player must see they are betting on real-world events.
- **No RNG anywhere.** The "spin" is a settlement clock counting down to the underlying market's resolution. The "winning number" is whichever cells' real-world events happened to occur.
- Settlement is the underlying market's settlement, audited and verifiable. No house-resolves-in-favor-of-house.
- Surface the prop oracle's source on each cell — "via Kalshi" / "via Polymarket" — so it is unambiguous that bets are pass-through.

If a regulator pulls up the product and sees 36 numbered cells with real-world questions printed on each, plus citations to public markets and public settlement data, the case for "this is not gambling" is the same case Kalshi already won. If they see a roulette wheel that spins and reveals a number, we lose.

---

## Onboarding plan — explaining this to a new user

The product is mathematically simple but conceptually weird. Two audiences with opposite needs:

**Audience A — the casual / casino-curious.** Wants to drop chips. Doesn't care about prediction markets. Worry: bounces if the first screen is a wall of "what is a prediction market?"

**Audience B — the prediction-market native (existing Sneakers users).** Wants the alpha. Worry: thinks it looks gimmicky and dismisses it.

The onboarding has to land both. Proposed three-screen flow:

### Screen 1 — the tease (no signup gate)
Live demo round running. Wheel fills the screen, real props on real cells, real countdown. **No chips required to watch.** The reveal animation plays at the end of every round, lit cells citing real events. Watch one round and the concept is obvious.

Single CTA: *"Place a chip on the next round"* → opens screen 2.

### Screen 2 — the one-paragraph explainer
Inline, not a tutorial. One paragraph above the chip selector:

> *Each cell is a real bet on a real event, sized so the payout matches the odds. Cell 17 pays 35x because the underlying event has a ~2.78% chance of happening. We source the events from public prediction markets — you can see each one by tapping the cell. When the round closes, the events that actually happened light up.*

Then a "Show me" link that flips the wheel to "prop view" — same grid, but each cell shows its prop text instead of its number. Toggle freely.

### Screen 3 — the first-bet hand-hold
First chip placement triggers a 3-step inline coachmark:
1. *"Tap a cell to see its prop."*
2. *"Drop your chip — you're betting [prop text] for $1 to win $X."*
3. *"Round closes in [time]. Watch the reveal."*

Never blocks the UI. Dismissible. Doesn't fire on the second bet.

### Education-as-product (post-MVP)
Long-term, the cell flip is the educational on-ramp into the broader Sneakers terminal. A user who plays the wheel for a week starts to see "oh, *that's* what a prediction market is." Then we surface a CTA: *"Want to bet on these directly without the wheel? Open the terminal."* That's the funnel from RoulettePredict → core Sneakers product.

This is the strategic value of the wheel beyond its own revenue: **it is the lowest-friction onboarding ramp into prediction markets that has ever existed.** The casino skin lowers the cognitive cost from "learn what an event contract is" to "drop a chip."

---

## Where it lives

Open decision (see below), but my recommendation: **separate sub-brand on a separate URL**, embedded as a tab in the iOS app and the web terminal. Sub-brand because (a) the audience overlaps but isn't identical, (b) regulatory blast radius — if a state AG comes after the wheel, they don't take down the terminal, (c) marketing is different (TikTok / casino-adjacent for the wheel, finance Twitter for the terminal).

iOS-side, design language stays Robinhood-clean per existing iOS plan — no Vegas-glitz aesthetic. The wheel itself can be visually rich, but the chrome around it stays minimal.

---

## Build sequencing — if and when we greenlight

This is a **post-100-testers, post-scrapers, post-iOS-MVP** project. Earliest realistic start: ~3–4 weeks out.

1. **Card assembler** (the prop oracle). Reuses scraper infrastructure. Outputs a card-per-window JSONL feed. ~1 week.
2. **Settlement engine** — listen for prop resolutions, mark cells lit, trigger payouts. ~3 days.
3. **Router/hedger** — actual money flow into Kalshi/Polymarket APIs. The slow part — needs accounts, KYC, capital. ~2 weeks calendar including external dependencies.
4. **Web wheel UI** — single-page, plays the demo round even without auth (for screen 1). ~1 week.
5. **Onboarding flow** — three-screen flow above. ~3 days.
6. **iOS wheel tab** — after web is validated. Don't build natively until web shows traction.

---

## Open decisions for you

1. **Round length to ship first.** 1-min impossible (see prior chat — settlement oracle problem). 5-min crypto-only. 15-min crypto+sports. 1-hour full inventory. **Recommend 15-min.**
2. **Game shape at launch.** Roulette only, or roulette+blackjack+slots? **Recommend roulette only** — cleanest math, blackjack's mid-hand odds shifts make sourcing brutal.
3. **House model.** Pure router (recommended) vs partial bookmaker (more profitable, much more regulatory load).
4. **Brand and URL.** Standalone (e.g., `roulettepredict.com`) or subroute on `sneakersterminal.com`? Standalone gives blast-radius isolation but doubles the marketing lift.
5. **Geo and KYC.** Same posture as the terminal, or stricter? Even though the framing is "not gambling," some states (NY, WA) treat *anything* with implied randomness as gambling regardless of substance. Need a lawyer review before launch.
6. **Capital for router/hedger.** Float requirement — if you're routing $10K/round and laying off in real-time, you need ~$30K+ working capital across exchanges. Not free.

---

## Why this isn't on the roadmap yet

Briefly, so we don't talk ourselves into building it before scrapers ship:
- Scrapers + 100 testers is the make-or-break for the core product.
- iOS MVP unblocks the money tab and is gated on Xcode install.
- Referral plan is closer to revenue impact.
- This is a *new product surface* not an extension of the existing one. It deserves its own runway, not a side-quest mid-sprint.

Revisit when: scrapers stable + 100+ active testers + iOS shipped. Probably ~6 weeks out.
