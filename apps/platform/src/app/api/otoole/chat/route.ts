import { getAuthClient } from '@/lib/supabase-auth'
import { loadMarkets, type MarketSnapshot, type BookFreshness } from '@/lib/markets-data'
import { aggregateByCategory, categoryOf, type TerminalCategory } from '@/lib/market-stats'
import { checkDailyCap, incrementAndGetCount } from '@/lib/otoole-usage'
import { AI_MODELS, DEFAULT_MODEL, FREE_TIER_DEFAULT_MODEL, canUseModel, modelById, type AIModelMeta } from '@/lib/ai-models'
import { getBalance, spendCredits } from '@/lib/credits'
import { getAdapter, ChatAdapterError } from '@/lib/ai-providers'
import { getUserProviderKey } from '@/lib/provider-keys'
import { formatSneakersContext } from '@/lib/otoole-backend-context'
import { findCrossBookPairs } from '@/lib/arb-scanner'
import { loadMinuteMarkets } from '@/lib/minute-markets'
import { getServerClient } from '@/lib/supabase-server'
import { OTOOLE_TOOLS, createOtooleToolExecutor } from '@/lib/otoole-tools'

// POST /api/otoole/chat
//
// Body: { messages: [{role: 'user'|'assistant', content: string}, ...] }
// Returns: { role: 'assistant', content: string } on success, or
//          { error: string, stub?: string } when auth/key/runtime fails.
//
// The server reads the latest MarketSnapshot batch (same loader as /markets
// and /dashboard), pre-digests it into a context block, and ships it as the
// system prompt alongside O'Toole's persona. Keeps the client thin — the
// browser just shows the message list; all market context lives server-side.

export const runtime = 'nodejs' // fs access required by loadMarkets
export const dynamic = 'force-dynamic'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

// Input caps. Without these a single authed call could ship megabytes of
// content and burn provider tokens at our expense (or, when using BYO key,
// drain the user's third-party budget while still pinning our serverless
// concurrency). Numbers tuned for "useful chat history" not "whole novel."
const MAX_MESSAGES = 50
const MAX_CONTENT_CHARS = 8_000
const MAX_TOTAL_CHARS = 64_000

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function topOutcomeProb(m: MarketSnapshot): number | null {
  let best: number | null = null
  for (const o of m.outcomes) {
    const p = o.best_ask ?? o.last_price
    if (p !== null && p !== undefined && (best === null || p > best)) best = p
  }
  return best
}

// Stale = no row written in the last 30 min. O'Toole should mention this when
// citing prices from a stale book — the actual market may have moved.
const STALE_AFTER_MS = 30 * 60 * 1000

function formatFreshness(perBook: Record<string, BookFreshness>): string {
  const now = Date.now()
  const stale: string[] = []
  const fresh: string[] = []
  for (const [book, info] of Object.entries(perBook)) {
    if (!info.latestTs) {
      stale.push(`${book}=no-data`)
      continue
    }
    const ageMs = now - new Date(info.latestTs).getTime()
    if (!Number.isFinite(ageMs)) continue
    const ageMin = ageMs / 60_000
    if (ageMs > STALE_AFTER_MS) {
      stale.push(
        `${book}=${ageMin >= 60 ? `${(ageMin / 60).toFixed(1)}h` : `${Math.round(ageMin)}m`}`,
      )
    } else {
      fresh.push(`${book}=${Math.round(ageMin)}m`)
    }
  }
  if (stale.length === 0 && fresh.length === 0) return '  (no platforms reporting)'
  const lines: string[] = []
  if (stale.length > 0)
    lines.push(`  STALE (>30min, discount these prices): ${stale.join(', ')}`)
  if (fresh.length > 0) lines.push(`  Fresh: ${fresh.join(', ')}`)
  return lines.join('\n')
}

function formatMarketContext(markets: MarketSnapshot[], snapshotDate: string | null): string {
  const stats = aggregateByCategory(markets)
  const catSummary = (Object.keys(stats) as TerminalCategory[])
    .filter((c) => stats[c].activeCount > 0)
    .map((c) => {
      const s = stats[c]
      const avg = s.avgProb !== null ? `${Math.round(s.avgProb * 100)}%` : '—'
      return `  - ${c}: ${s.activeCount.toLocaleString()} active, avg top-outcome prob ${avg}`
    })
    .join('\n')

  // Top 40 by volume — enough for "what's hot?" questions without blowing context.
  const top = [...markets]
    .filter((m) => m.phase !== 'closed')
    .sort((a, b) => (toNum(b.volume_traded) ?? 0) - (toNum(a.volume_traded) ?? 0))
    .slice(0, 40)

  const lines = top.map((m) => {
    const p = topOutcomeProb(m)
    const probStr = p !== null ? `${(p * 100).toFixed(1)}%` : '—'
    const vol = toNum(m.volume_traded)
    const volStr = vol !== null ? (vol >= 1000 ? `$${(vol / 1000).toFixed(1)}K` : `$${vol.toFixed(0)}`) : '—'
    const edge = m.overround !== null && m.overround > 1.001 ? ` edge=${((m.overround - 1) * 100).toFixed(1)}pp` : ''
    const cat = categoryOf(m)
    return `  [${m.platform}/${cat}] ${m.question} — top=${probStr} vol=${volStr}${edge}`
  })

  const widest = [...markets]
    .filter((m) => m.phase !== 'closed' && m.overround !== null && m.overround >= 1.05)
    .sort((a, b) => (b.overround ?? 0) - (a.overround ?? 0))
    .slice(0, 10)
    .map((m) => {
      const pp = ((m.overround! - 1) * 100).toFixed(1)
      return `  [${m.platform}] ${m.question} — overround=${m.overround!.toFixed(3)} (+${pp}pp)`
    })

  // Real cross-book arb signal — sportsbook game moneylines paired across books.
  // findCrossBookPairs computes the proper sum(cheapest_home_ask + cheapest_away_ask).
  // sum < 1.00 = guaranteed-profit arb (before fees + slippage); sum 1.00–1.02 =
  // near-arb worth eyeballing. We surface both so O'Toole can distinguish "real
  // arb" from "single-book wide overround" — they're different kinds of signal.
  const pairs = findCrossBookPairs(markets, { maxQuoteSkewMinutes: 10 })
  const arbHits = pairs
    .filter((p) => p.isArb && p.bestSum != null)
    .sort((a, b) => (a.bestSum ?? 1) - (b.bestSum ?? 1))
    .slice(0, 8)
  const nearArbs = pairs
    .filter((p) => !p.isArb && p.bestSum != null && p.bestSum <= 1.02)
    .sort((a, b) => (a.bestSum ?? 1) - (b.bestSum ?? 1))
    .slice(0, 8)

  const fmtPair = (p: typeof pairs[number]) => {
    const sum = p.bestSum!
    const edge = (1 - sum) * 100
    const sign = edge >= 0 ? '+' : ''
    const home = p.cheapestHome
      ? `${p.cheapestHome.platform}@$${p.cheapestHome.ask.toFixed(3)}`
      : '—'
    const away = p.cheapestAway
      ? `${p.cheapestAway.platform}@$${p.cheapestAway.ask.toFixed(3)}`
      : '—'
    const books = p.quotes.map((q) => q.platform).join('+')
    return `  [${p.sport}] ${p.away} @ ${p.home} — sum=${sum.toFixed(3)} (${sign}${edge.toFixed(2)}pp) · cheap HOME ${home} + cheap AWAY ${away} · books=${books}`
  }

  // Derive book list from actual data instead of hardcoding — surfaces every
  // platform with a current row, not a stale strings list.
  const books = [...new Set(markets.map((m) => m.platform))].sort()
  const booksLine = books.length > 0 ? books.join(', ') : '(no platforms found)'

  return [
    `# Current market snapshot (${snapshotDate ?? 'unknown date'})`,
    `Total active markets: ${markets.filter((m) => m.phase !== 'closed').length}`,
    `Books covered: ${booksLine}`,
    ``,
    `CATEGORY BREAKDOWN:`,
    catSummary || '  (no categories with active markets)',
    ``,
    `TOP ${top.length} BY VOLUME:`,
    lines.join('\n'),
    ``,
    `WIDEST OVERROUNDS (single-book — overround > 1.05; these are wide quotes, NOT arbs):`,
    widest.length > 0 ? widest.join('\n') : '  (no markets above threshold right now)',
    ``,
    `CROSS-BOOK ARBS (sportsbook moneylines, sum(best_ask) < 1.00 — real guaranteed-profit signal before fees):`,
    arbHits.length > 0
      ? arbHits.map(fmtPair).join('\n')
      : '  (no arbs hit on the current snapshot)',
    ``,
    `NEAR-ARBS (sum 1.00–1.02 — close enough to watch for movement):`,
    nearArbs.length > 0
      ? nearArbs.map(fmtPair).join('\n')
      : '  (no near-arb candidates above threshold)',
  ].join('\n')
}

// Sub-hour crypto / binary markets across Limitless + OG + Kalshi. Differs
// from the main market context (top-40 by volume) because minute markets are
// inherently low-volume in their final minutes — they get filtered out by
// volume sort but are exactly the markets a user might want to act on now.
async function formatMinuteMarketsBlock(): Promise<string> {
  try {
    const result = await loadMinuteMarkets({
      within: 60,
      grouped: true,
      cryptoOnly: true,
    })
    if (!result.groups || result.groups.length === 0) {
      return '# Minute markets (≤60min to resolution)\n  (none active right now)'
    }
    const top = result.groups.slice(0, 8) // 8 groups is enough; one per asset/expiry pair
    const lines = top.map((g) => {
      const asset = g.asset ?? '?'
      const mins =
        g.minutes_to_resolve < 1
          ? `${Math.round(g.minutes_to_resolve * 60)}s`
          : `${g.minutes_to_resolve.toFixed(1)}m`
      const platforms = g.platforms.join('+')
      const range =
        g.strike_min != null && g.strike_max != null
          ? `strikes $${g.strike_min.toLocaleString()}–$${g.strike_max.toLocaleString()}`
          : 'strikes —'
      return `  [${asset}] resolves in ${mins} (${new Date(g.resolves_at).toISOString().slice(11, 16)} UTC) · ${g.market_count} strikes · ${platforms} · ${range}`
    })
    return [
      '# Minute markets (≤60min to resolution, crypto-only)',
      `Active: ${result.totalMarkets} markets across ${result.totalGroups ?? 0} (asset × expiry) groups.`,
      `Buckets: 5m=${result.bucketCounts['5m']}, 15m=${result.bucketCounts['15m']}, 30m=${result.bucketCounts['30m']}, 60m=${result.bucketCounts['60m']}.`,
      `Assets seen: ${result.assetsAvailable.join(', ') || 'none'}`,
      '',
      `Top 8 groups by closest expiry:`,
      lines.join('\n'),
    ].join('\n')
  } catch (err) {
    console.warn('[otoole/chat] minute-markets block failed', err)
    return '# Minute markets (≤60min to resolution)\n  (loader failed — ignore this section)'
  }
}

// User-scoped context block. Pulls the user's tier (from cap), credit balance,
// and a tiny recent-activity slice from click_events. Server-only — never
// returned to the client. Lets O'Toole personalize ("you've been viewing BTC
// markets — there's a 3pp arb on BTC right now") without the user re-asking.
async function formatUserContext(opts: {
  userId: string
  email: string
  tier: string
  balance: number
}): Promise<string> {
  const lines: string[] = ['# User context (this user only)']
  lines.push(
    `tier=${opts.tier} · balance=${opts.balance.toLocaleString()} credits · email=${opts.email}`,
  )

  try {
    const admin = getServerClient()
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await admin
      .from('click_events')
      .select('event_name, page, target, ts')
      .eq('user_id', opts.userId)
      .gte('ts', sinceIso)
      .order('ts', { ascending: false })
      .limit(50)
    const events = (recent ?? []) as Array<{
      event_name: string
      page: string | null
      target: string | null
      ts: string
    }>
    if (events.length === 0) {
      lines.push('Recent activity (last 7d): no events recorded yet.')
    } else {
      // Top events by name
      const counts = new Map<string, number>()
      for (const e of events) counts.set(e.event_name, (counts.get(e.event_name) ?? 0) + 1)
      const topEvents = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      lines.push(
        `Top events (last 7d, ${events.length} total): ` +
          topEvents.map(([n, c]) => `${n}=${c}`).join(', '),
      )
      // Recent market detail pages they've viewed (signal of interest)
      const marketViews = events
        .filter((e) => e.event_name === 'page_view' && /\/markets\//.test(e.page ?? ''))
        .slice(0, 5)
        .map((e) => `${e.page} (${new Date(e.ts).toLocaleTimeString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })})`)
      if (marketViews.length > 0) {
        lines.push(`Recently viewed market pages: ${marketViews.join(' · ')}`)
      }
      // Trade-intent signals — if they've clicked a venue CTA recently, that's
      // a high-intent moment worth referencing.
      const tradeIntents = events.filter((e) => e.event_name === 'venue_cta_click').slice(0, 3)
      if (tradeIntents.length > 0) {
        lines.push(
          `Recent trade-intent clicks: ${tradeIntents.length} venue_cta_click events in last 7d`,
        )
      }
    }
  } catch (err) {
    console.warn('[otoole/chat] user-context query failed', err)
    lines.push('(activity query failed — answer without personalization)')
  }

  return lines.join('\n')
}

const OTOOLE_PERSONA = `You are O'Toole, the AI analyst embedded in Sneakers Terminal — a Bloomberg-style dashboard for prediction markets and sports betting.

Your job: help serious bettors make sense of live prices across every book Sneakers tracks. You reason about:
- Which markets are worth looking at (high volume, wide overrounds, interesting narratives)
- What a given market's pricing implies, and whether it looks mispriced vs. fundamentals
- Cross-book arbitrage candidates (overround > 1.0 on a single book, or price gaps across books)
- Bet sizing (Kelly criterion, bankroll management) when a position is in scope
- Questions about Sneakers itself — books tracked, pricing, tier features, how credits work, etc. (answer from the backend-knowledge block below)

Tone: direct, quantitative, professional. Cite specific markets and numbers from the snapshot below when it helps. Don't hedge excessively — the user is here because they want your take. When you're not sure, say so concretely ("no volume data for this market" vs. "I'm not confident").

Strategy partner mode (Phase 1A):
You're not just an analyst — you help users build and refine trading strategies. The user describes a market thesis ("I want to buy mispriced NBA player props when they hit ≤30¢"); you codify it as concrete alert rules with proper trigger config, market filters, and channels. When you spot a real opportunity (high cross-book edge, large move into your tracked range), you can propose_trade so the user confirms with one click on their dashboard. You never place real orders — execution requires their explicit confirm.

Tool use — read tools (no auth needed):
- find_arbs: cross-book moneyline arbs by edge. "any arbs right now?" / "what should I look at?".
- get_minute_markets: sub-60-min crypto markets. "what's about to settle?" / "BTC right now?".
- get_market: full detail on one market including 7-day history. Drill-in after a search.
- search_markets: text search to find platform_market_ids you don't already know.

Tool use — strategy-scaffolding (user-scoped, write):
- list_my_alert_rules: ALWAYS call this BEFORE creating a new rule, to check whether a similar one exists. Suggest editing or skipping if one already does.
- create_alert_rule: only when the user has expressed clear intent. Validate inputs to the trigger schema before calling — bad config is rejected by the validator with a specific error, but you should aim to get it right first try.
- update_alert_rule / delete_alert_rule: ONLY for rules where created_by='otoole'. User-created rules are read-only from your side; if the user wants one of those changed, tell them to do it via /dashboard/alerts directly.
- get_my_recent_activity: pull the user's last 7d of click_events for personalization. Use sparingly — once per conversation is plenty unless the topic shifts.
- propose_trade: Use when (a) the user says "buy X" / "execute Y" with clear specs, OR (b) you've found a high-edge cross-book arb that meets your conviction bar (≥2pp after fees, both books fresh, reasonable volume on both legs). ALWAYS include a plain-language rationale — that's the audit trail. Cap proposals at ~$25-100 size on first interaction with a user; ramp up only if they indicate appetite.

General tool guidance:
- One or two tool calls per question is plenty. Don't loop more than necessary.
- The system-prompt snapshot is a cached summary; when in doubt, call a tool to confirm.
- If a write tool returns an error (tier cap reached, market not found, user not on waitlist), surface that error in plain English to the user — don't retry blindly.

Important guardrails:
- Two distinct arb signals in the snapshot — DON'T conflate them:
  - WIDEST OVERROUNDS: single-book overround > 1.05. This is just a wide-spread quote on one book; NOT executable arbitrage. Treat as "this book is pricing wide here, worth eyeballing."
  - CROSS-BOOK ARBS: sum(cheapest_home_ask + cheapest_away_ask) < 1.00 across two different books. THIS is real guaranteed-profit arb (before fees + slippage). When citing one of these, name both books and both prices, and call out edge in pp.
- Real-world fees you should mention when discussing CROSS-BOOK ARBS: ProphetX/NoVig take ~1-2% commission, Polymarket has 0% fees but Polygon gas costs, Kalshi has small fees. So a 0.5pp edge is probably break-even after costs; 2pp+ is genuine.
- DATA FRESHNESS: if a book is flagged as STALE (>30min since last scrape), discount any price from it — the market may have moved. Mention the staleness when citing.
- MINUTE MARKETS: the section showing "≤60min to resolution" is high-frequency crypto (BTC/ETH/SOL/etc). When the user asks "what's about to settle" or "any quick trades," reach for that block first. These markets are low-volume by nature — don't apply the same volume thresholds you would to a season-long futures market.
- USER CONTEXT: the "User context" block tells you the user's tier, credit balance, and recent activity. If they've been clicking on BTC markets and you see a BTC arb, mention the connection. DON'T pitch them a tier they're already on. DON'T tell them to top up credits unless they ask about it.
- If the user asks about something not in the snapshot (e.g. a market not listed, or historical data), say so — don't hallucinate prices.
- If the user asks about THEIR account (balance, watchlists, positions) and you don't see it in the context, say you don't have it loaded — don't guess. That's user-scoped data the server only injects when relevant.
- Never talk about another user's or business's data. Each O'Toole session is scoped to one user; if someone asks about "Company X's signals," only answer if Company X is the user's own tenant.
- This is educational analysis, not financial advice. Trading involves substantial risk of loss.

Keep responses concise — 2-4 short paragraphs max unless the user explicitly asks for depth. No bulleted lists of 10+ items; pick the 3-5 most relevant.`

export async function POST(req: Request) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !user.email) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // Daily cap check — gated by tier. Free tier gets 5 messages/day; paid tiers
  // get progressively more. Cap counts by UTC day and resets at midnight UTC.
  // `checkDailyCap` fails open on DB errors (see otoole-usage.ts) so a missing
  // migration doesn't brick the chat.
  const cap = await checkDailyCap(user.id, user.email)
  if (!cap.allowed) {
    const hours = Math.ceil(cap.resetsInSeconds / 3600)
    return Response.json(
      {
        error: 'daily_cap_reached',
        message: `You've used your ${cap.cap} daily O'Toole messages on the ${cap.tier} tier. Resets in ~${hours}h, or upgrade for a higher cap.`,
        tier: cap.tier,
        cap: cap.cap,
        used: cap.count,
        resetsInSeconds: cap.resetsInSeconds,
      },
      { status: 429, headers: { 'retry-after': String(cap.resetsInSeconds) } },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: unknown; model?: unknown }
  const messages = Array.isArray(body.messages) ? (body.messages as unknown[]) : []

  // Resolve the requested model (or default it from tier). Reject if the
  // model is disabled or the user's tier can't use it. Credits are checked
  // separately below.
  const requestedModelId = typeof body.model === 'string' ? body.model : null
  const defaultForTier: string =
    cap.tier === 'free' ? FREE_TIER_DEFAULT_MODEL : DEFAULT_MODEL
  const model: AIModelMeta | undefined = requestedModelId
    ? modelById(requestedModelId)
    : modelById(defaultForTier)
  if (!model) {
    return Response.json({ error: 'unknown_model', message: `Model "${requestedModelId}" is not recognized.` }, { status: 400 })
  }
  if (!model.enabled) {
    return Response.json(
      {
        error: 'model_disabled',
        message: `${model.displayName} isn't wired up yet. Coming soon — pick Claude Haiku/Sonnet/Opus for now.`,
      },
      { status: 400 },
    )
  }
  if (!canUseModel(model, cap.tier)) {
    return Response.json(
      {
        error: 'model_requires_upgrade',
        message: `${model.displayName} requires the ${model.minTier} tier or higher. You're on ${cap.tier}.`,
        model: model.id,
        minTier: model.minTier,
        currentTier: cap.tier,
      },
      { status: 402 },
    )
  }

  // Resolve the API key to use: BYO key takes precedence over Sneakers' env
  // key. When BYO is used we skip the credit debit — the user pays their
  // provider directly and gets cheaper usage at the cost of managing their
  // own key.
  const byoKey = await getUserProviderKey(user.id, model.provider)
  const envKeyByProvider: Record<typeof model.provider, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    xai: process.env.XAI_API_KEY,
  }
  const apiKey = byoKey ?? envKeyByProvider[model.provider]
  const usingByoKey = Boolean(byoKey)

  if (!apiKey) {
    return Response.json(
      {
        role: 'assistant',
        content: `O'Toole can't reach ${model.displayName} — no API key configured for ${model.provider}. Either add your own key at /dashboard/settings/api-keys or ask your admin to set the server env var.`,
        stub: true,
      },
      { status: 200 },
    )
  }

  // Check credit balance only when NOT using a BYO key — BYO users pay their
  // provider directly, credit debit doesn't apply. Free-tier users without
  // credits get up to 5 Haiku messages/day via the daily cap above; buying
  // any credits lets them use smarter models.
  const balance = await getBalance(user.id)
  if (!usingByoKey) {
    const hasCredits = balance.balance >= model.creditCostPerMessage
    if (!hasCredits && model.creditCostPerMessage > 3) {
      return Response.json(
        {
          error: 'insufficient_credits',
          message: `${model.displayName} costs ${model.creditCostPerMessage} credits per message. Balance: ${balance.balance}. Buy credits or add your own ${model.provider} key in settings to skip the credit charge.`,
          required: model.creditCostPerMessage,
          balance: balance.balance,
        },
        { status: 402 },
      )
    }
  }
  if (messages.length > MAX_MESSAGES) {
    return Response.json(
      {
        error: 'too_many_messages',
        message: `Conversation too long (${messages.length}). Trim history to under ${MAX_MESSAGES} messages.`,
      },
      { status: 400 },
    )
  }

  const cleaned: ChatMessage[] = []
  let totalChars = 0
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue
    const role = (m as { role?: unknown }).role
    const content = (m as { content?: unknown }).content
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      const trimmed = content.trim()
      if (trimmed.length > MAX_CONTENT_CHARS) {
        return Response.json(
          {
            error: 'message_too_long',
            message: `One message is ${trimmed.length.toLocaleString()} chars; cap is ${MAX_CONTENT_CHARS.toLocaleString()}.`,
          },
          { status: 400 },
        )
      }
      totalChars += trimmed.length
      if (totalChars > MAX_TOTAL_CHARS) {
        return Response.json(
          {
            error: 'payload_too_large',
            message: `Total conversation size exceeds ${MAX_TOTAL_CHARS.toLocaleString()} chars. Start a new chat.`,
          },
          { status: 400 },
        )
      }
      cleaned.push({ role, content: trimmed })
    }
  }
  if (cleaned.length === 0) {
    return Response.json({ error: 'empty_messages' }, { status: 400 })
  }
  if (cleaned[0].role !== 'user') {
    return Response.json({ error: 'first_message_must_be_user' }, { status: 400 })
  }

  // Load market context for the system prompt. Three blocks fetched in
  // parallel — each independent so failures degrade gracefully.
  let marketContext = '(market snapshot unavailable — the scraper data may not be mounted in this environment)'
  let freshnessBlock = ''
  let minuteBlock = ''
  let userContextBlock = ''

  const [marketsResult, minuteResult, userResult] = await Promise.allSettled([
    loadMarkets({ pageSize: 10_000 }),
    formatMinuteMarketsBlock(),
    formatUserContext({
      userId: user.id,
      email: user.email,
      tier: cap.tier,
      balance: balance.balance,
    }),
  ])

  if (marketsResult.status === 'fulfilled') {
    const { markets, dataDate, perBook } = marketsResult.value
    marketContext = formatMarketContext(markets, dataDate)
    freshnessBlock = `# Data freshness (per-book age since last scrape row)\n${formatFreshness(perBook)}`
  } else {
    console.error('[otoole/chat] market load failed', marketsResult.reason)
  }
  if (minuteResult.status === 'fulfilled') minuteBlock = minuteResult.value
  if (userResult.status === 'fulfilled') userContextBlock = userResult.value

  // Layer 1 platform knowledge — venues, models, credits, tiers, routes. Same
  // across every tenant; prepended to marketContext so it rides in the same
  // cached system block. Backend-context changes only when catalogs update
  // (rare), scraper marketContext changes every ~10 min — cache rewrite on
  // scrape cycle, cache hit within it. Keeps unit economics good.
  const platformContext = formatSneakersContext()
  const combinedContext = [
    platformContext,
    '---',
    marketContext,
    freshnessBlock,
    minuteBlock,
    userContextBlock,
  ]
    .filter(Boolean)
    .join('\n\n')

  // Route the request through the provider-agnostic adapter. The adapter
  // handles SDK-specific details (Anthropic's cache-control, OpenAI's
  // message shape, Google's systemInstruction, xAI's OpenAI-compatible
  // endpoint) and returns a uniform ChatResult.
  const adapter = getAdapter(model.provider)

  // Tool-use is Anthropic-only for now (their tool API is the cleanest of the
  // four; OpenAI/Google/xAI fall back to the no-tools text path). When tools
  // are passed but the adapter doesn't support them, the field is silently
  // ignored — the chat still works, just without on-demand data fetching.
  const supportsTools = model.provider === 'anthropic'

  // Resolve the user's waitlist row id once — write tools (alert rule CRUD,
  // propose_trade) need it because alert_rules.user_id and trade_drafts.user_id
  // both reference public.waitlist(id), not auth.users(id). Best-effort: if
  // the user isn't on the waitlist, the tools that need waitlistId return a
  // clear error rather than guessing.
  let waitlistId: string | null = null
  try {
    const sb = getServerClient()
    const { data: row } = await sb
      .from('waitlist')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .maybeSingle()
    waitlistId = row?.id ?? null
  } catch (err) {
    console.warn('[otoole/chat] waitlist lookup failed; user-scoped tools will error', err)
  }

  const toolExecutor = createOtooleToolExecutor({
    authUserId: user.id,
    email: user.email,
    tier: cap.tier,
    waitlistId,
  })

  try {
    const result = await adapter.chat({
      modelId: model.id,
      systemPrompt: OTOOLE_PERSONA,
      marketContext: combinedContext,
      messages: cleaned,
      maxTokens: 2048,
      apiKey,
      ...(supportsTools
        ? {
            tools: OTOOLE_TOOLS,
            executeToolCall: toolExecutor,
            maxToolIterations: 5,
          }
        : {}),
    })

    // Record usage AFTER a successful response so failed requests don't count
    // against the user's daily cap. We await it so the response headers
    // reflect the post-increment count, but don't fail the request if the
    // DB write falls over.
    let usedAfter = cap.count + 1
    try {
      usedAfter = await incrementAndGetCount(user.id, {
        input: result.tokensInput,
        output: result.tokensOutput,
      })
    } catch (err) {
      console.error('[otoole/chat] usage increment failed', err)
    }

    // Spend credits only when NOT using BYO key AND user has a balance.
    // When using BYO, the user's paying their provider directly — no credit
    // debit. When on credits, we debit every paid message regardless of
    // the per-message cost (the cost is already baked into model catalog).
    let balanceAfter: number | null = null
    if (!usingByoKey && balance.balance >= model.creditCostPerMessage) {
      balanceAfter = await spendCredits(user.id, model.creditCostPerMessage, {
        modelId: model.id,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
      })
    }

    return Response.json({
      role: 'assistant',
      content: result.text || "(O'Toole returned an empty response — try rephrasing?)",
      model: model.id,
      usingByoKey,
      creditsSpent: balanceAfter != null ? model.creditCostPerMessage : 0,
      balance: balanceAfter ?? balance.balance,
      usage: {
        input: result.tokensInput,
        cached_read: result.tokensCachedRead,
        cached_write: result.tokensCachedWrite,
        output: result.tokensOutput,
      },
      cap: {
        used: usedAfter,
        limit: cap.cap,
        tier: cap.tier,
        resetsInSeconds: cap.resetsInSeconds,
      },
    })
  } catch (err) {
    if (err instanceof ChatAdapterError) {
      console.error('[otoole/chat]', model.provider, 'error', err.status, err.message, err.providerCode)
      return Response.json(
        { error: err.providerCode ?? 'api_error', message: err.message },
        { status: 500 },
      )
    }
    console.error('[otoole/chat] unknown error', err)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
}
