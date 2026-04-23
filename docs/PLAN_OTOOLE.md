# O'Toole — improvement + learning plan

Where O'Toole is today (April 2026), what each level of investment unlocks, and the path that's worth shipping. Written 2026-04-23 for use across multiple Claude Code sessions.

## TL;DR

O'Toole today is a **prompted Anthropic / OpenAI chat with a backend-context preamble**. It doesn't learn, doesn't remember per-user, doesn't action anything. Each turn is one API call with the system prompt + current market snapshot + the user's message. Multi-provider routing exists (Haiku/Sonnet/Opus + GPT) and credits gate usage.

The single biggest unlock is **persistent per-user memory** — it's the difference between "smart Q&A" and something that feels like a trader's analyst.

---

## Current state (read this first)

**Architecture** (see `apps/platform/src/lib/otoole-*.ts` and `src/app/api/otoole/chat/route.ts`):

- **Models available**: Anthropic Haiku 4.5, Sonnet 4.6, Opus 4.7 + OpenAI GPT-5 / GPT-5-mini. User picks per-message; cost charged in credits (3 / 30 / 150 per message roughly).
- **System prompt**: hand-written; includes platform list, market schema, brand voice (`otoole-backend-context.ts`).
- **Per-request context**: latest snapshots from `loadMarkets()` aggregated into a small `catSummary` block (count + avg prob per category). One injection per turn.
- **No memory**: no chat history persistence beyond the in-tab React state. New tab = new conversation.
- **No tools**: model can't fetch a specific market's history, can't query the DB, can't place orders. Pure reply-with-text.
- **No fine-tuning, no RAG**: every turn re-injects the same backend context.

**What works**:
- Multi-provider with model picker is shipped and tested.
- Credit billing works end-to-end (Stripe webhook → credit balance update).
- The system-prompt injection genuinely makes O'Toole feel "of-the-product" rather than a generic chatbot.

**What's missing**:
- Memory — every conversation is amnesic.
- Action — O'Toole can recommend "look at the Yankees market" but can't fetch its full price history; user has to navigate manually.
- Personalization — never uses what THIS user cares about.
- Eval / observability — no idea what users actually ask, where O'Toole is wrong, or which model is delivering value.

---

## Levels of investment

Ordered cheapest → most ambitious. Each level is independently shippable.

### Level 0 — Instrumentation (1 day)

**You can't improve what you can't see.** Before any model work:

- **Log every conversation turn** to a `otoole_messages` table in Supabase: user_id, model, system_prompt_version, user_msg, assistant_msg, latency_ms, tokens_in/out, cost.
- **Thumbs-up/thumbs-down** in the chat UI per response. One-click rating.
- **Weekly admin dashboard** at `/admin/otoole/quality` showing: total messages, cost-per-day, model split, top failure modes (lowest-rated turns).

Without this, every change below is guesswork.

**Effort**: 1 day. Owner: another Claude Code; the schema change is 30 lines, the UI is small.
**Risk if skipped**: optimizing blind.

### Level 1 — Persistent conversation memory (2–3 days)

Per-user, per-conversation history. New conversation button + sidebar of past convos. When the user returns 3 days later, O'Toole still knows what they last asked about.

- New table `otoole_conversations(id, user_id, title, last_active_at)`.
- New table `otoole_messages` extended to FK on `conversation_id`.
- Sidebar pane in `/dashboard` (right side, collapsible) listing recent conversations.
- On model call, include the last N turns of the active conversation in the context window. Truncate if approaching token cap; summarize older turns into a single "earlier in conversation:" block.
- Auto-generate titles after the first 2 turns ("BTC > $100k bet sizing", "Yankees moneyline arb").

**Effort**: 2–3 days.
**Why it matters**: this is the single biggest UX upgrade. Users go from "I'm chatting with a stateless LLM" to "I'm working with my AI analyst." Every consumer LLM product (ChatGPT, Claude, Perplexity) has this and users now expect it.
**Risk if skipped**: the chat feels like a toy.

### Level 2 — Per-user preference memory (1–2 days, after L1)

A separate "user_facts" memory layer that the model writes to itself. Different from conversation memory: facts persist across all conversations.

- New table `otoole_user_facts(user_id, fact, source_message_id, created_at)`.
- After each assistant turn, ask the model "did the user share a durable preference, position, or constraint?" — if yes, write a single-sentence fact.
- Inject the user's top 20 most recent facts into every system prompt.
- "Forget about X" command in the chat that deletes matching facts.

Examples of facts O'Toole would remember:
- "Bankroll is $10k"
- "Avoids crypto markets"
- "Lives in NY — no DK, no FanDuel SB on prop bets"
- "Likes kelly-fraction sizing at 0.25"

**Effort**: 1–2 days, builds on L1's table structure.
**Why it matters**: differentiates from generic ChatGPT. ChatGPT has memory but doesn't know your bankroll, your jurisdiction, your strategy preferences.
**Risk if skipped**: O'Toole gives the same generic "consider position sizing" advice to a $10M whale and a $200 college student.

### Level 3 — Tool use / function calling (1 week)

Give O'Toole the ability to fetch specific data on demand instead of relying on the static context dump.

Anthropic + OpenAI both support tool calling. Define 4–6 tools:

- `get_market_history(market_id, hours)` — pulls historical price for one market
- `get_cross_book_pairs(sport, max_results)` — runs the existing arb scanner
- `get_user_positions()` — once we have that
- `get_market_news(market_id)` — when news data exists
- `compute_kelly(prob, odds, bankroll)` — pure math helper
- `find_markets(query)` — fuzzy search across active markets

Model decides when to call them. Returns structured data. Final reply weaves the data in.

**Effort**: 1 week. Need to define tool schemas, route calls, handle errors, plumb DB queries.
**Why it matters**: O'Toole stops being a Q&A interface and becomes a research interface. "Show me the price history of Lakers @ Warriors over the last 6 hours" becomes a single message instead of "open dashboard, find market, click drawer, scroll to chart."
**Risk if skipped**: the chat ceiling is "I asked, it answered." Doesn't compound.

### Level 4 — Action / execution (2–3 weeks, AFTER full Stripe + venue auth integration)

O'Toole places trades on behalf of the user via wallet/exchange APIs. The autotrade-tos branch exists for the consent UX. Out of scope until:
- All venue auth is solid
- Live cross-book arbs are flowing reliably
- Kelly + risk-management math has been audited
- Legal posture on "AI placing bets" is clear

When ready, it's another set of tools: `place_order(venue, market_id, side, stake)`. Strict Business-tier-and-above, dry-run first, opt-in per market.

**Effort**: weeks. Big legal + product surface.
**Risk if rushed**: regulatory + reputational catastrophe.

### Level 5 — Fine-tuning (DON'T, yet)

Fine-tuning a base model on Sneakers conversation data. **Skip this** until at least 6 months of usage. Reasons:
- Anthropic doesn't offer fine-tuning today; you'd be locked into OpenAI.
- Frontier models (Sonnet 4.6, Opus 4.7) outperform fine-tuned smaller models on the kind of reasoning Sneakers users care about.
- Fine-tuning data needs to be EXCEPTIONAL (curated, rated, edited). Without level 0 instrumentation you don't have it.
- Frontier RAG + good system prompts beat fine-tuning for this use case.

If you ever do fine-tune: target Haiku/GPT-5-mini for cost reduction on simple flows, keep Opus/Sonnet as the default for hard reasoning.

---

## What I'd actually ship — recommended sequence

| Order | Item | Effort | Output |
|---|---|---|---|
| 1 | **Level 0 — instrumentation** | 1 day | `otoole_messages` table + thumbs-up/down + admin dashboard |
| 2 | **Level 1 — conversation memory** | 2–3 days | Per-user conversations with sidebar |
| 3 | **Level 2 — preference memory** | 1–2 days | User-facts that persist across conversations |
| 4 | **Level 3 — tool use** | 1 week | 4–6 tools, starting with `get_market_history` and `get_cross_book_pairs` |

Total: ~2 weeks of focused work. After that, evaluate based on what level 0's data shows — maybe more tools, maybe better prompts, maybe better model routing.

Levels 4 + 5 stay out of scope for now.

---

## Tactical "today" wins (no model changes needed)

While you're not yet ready for the bigger investments, these are 30-min-each polish items that compound:

1. **Better empty-state for the chat panel.** Currently the user sees a message about "I've scanned active markets across Kalshi, Polymarket, NoVig and ProphetX." That's hardcoded. Make it list the actual platforms that have data right now (read from `loadAllLatestSnapshots`). Also rotate the example chip suggestions ("Find Edge / Whale Alerts / Portfolio Risk / Best Bets") to actually-relevant questions for current markets.
2. **Show which model the user just used** in the message footer. "Replied via Sonnet 4.6 · 0.3s · $0.012." Builds trust + helps the user see when to upgrade to Opus for harder questions.
3. **Cost preview before the user sends.** If they typed a long context-heavy message, show "≈ 47 cr (Sonnet)" before they hit send. Nobody likes surprise charges.
4. **System-prompt versioning.** Today the system prompt is editable in code; once you start iterating, version it (`SYSTEM_PROMPT_VERSION = '2026-04-23'`) and log which version each message used. Lets you A/B-compare quality after a prompt change.

Each of these is 1-prompt for another Claude Code.

---

## Things I'd specifically NOT build

- **Voice** — neat, low ROI. Trader users are at desks.
- **Image generation** — irrelevant to the use case.
- **Multi-agent orchestration** — over-engineering for chat.
- **Custom embeddings model** — frontier models' built-in retrieval beats anything you'd train.
- **Charts in chat** — markdown tables are enough; users have the dashboard for charts.

---

## Eval rubric (use post-level-0)

When you have logged conversations, measure these every week:

| Metric | Target | Why |
|---|---|---|
| Median time to first useful sentence | < 2s | UX |
| Thumbs-up rate (Sonnet) | > 70% | Quality bar |
| Thumbs-up rate (Haiku) | > 55% | If it dips below 50%, push more traffic to Sonnet |
| Conversations with ≥ 4 turns | > 30% | Engagement signal |
| % messages that prompt the user to navigate to a specific market | > 40% | Cross-sell to dashboard |
| Cost per active user / week | < $1.50 | Unit economics |

The thumbs-down conversations are the gold. Those tell you what to fix.

---

## Open questions for product

- **Should O'Toole be available to free-tier users?** Right now they get 5 messages / day. Pro gets 50. Elite gets 500. Business unlimited. Is that the right shape, or should free get 0 and start them at $1 trial credits?
- **Brand voice — funnier or more clinical?** The current system prompt leans terminal-trader-deadpan. Worth A/B testing a more human / friendly variant for retention.
- **Cross-conversation context — opt-in or default?** Some users want a fresh slate per session; others want one continuous thread. Could be a setting.

These are decisions for after Level 0's data lands.

---

## When to revisit this doc

- After Level 0 ships and you have 1 week of conversation logs
- If a user asks for a feature 3+ times that's not on this list
- Quarterly, regardless

Sneakers' edge isn't being the smartest LLM. It's being the LLM that knows your sportsbook accounts, your position size preferences, and where the live arbs are. Build toward that, not toward generic AI assistance.
