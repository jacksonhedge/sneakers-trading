import Anthropic from '@anthropic-ai/sdk'
import { getAuthClient } from '@/lib/supabase-auth'
import { loadMarkets, type MarketSnapshot } from '@/lib/markets-data'
import { aggregateByCategory, categoryOf, type TerminalCategory } from '@/lib/market-stats'
import { checkDailyCap, incrementAndGetCount } from '@/lib/otoole-usage'

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

  return [
    `MARKET SNAPSHOT (${snapshotDate ?? 'unknown date'})`,
    `Total active markets: ${markets.filter((m) => m.phase !== 'closed').length}`,
    `Books covered: Kalshi, Polymarket, NoVig, ProphetX`,
    ``,
    `CATEGORY BREAKDOWN:`,
    catSummary || '  (no categories with active markets)',
    ``,
    `TOP ${top.length} BY VOLUME:`,
    lines.join('\n'),
    ``,
    `WIDEST OVERROUNDS (possible arbitrage candidates — overround > 1.05):`,
    widest.length > 0 ? widest.join('\n') : '  (no markets above threshold right now)',
  ].join('\n')
}

const OTOOLE_PERSONA = `You are O'Toole, the AI analyst embedded in Sneakers Terminal — a Bloomberg-style dashboard for prediction markets and sports betting.

Your job: help serious bettors make sense of live prices across Kalshi, Polymarket, NoVig, ProphetX and (soon) sportsbooks. You reason about:
- Which markets are worth looking at (high volume, wide overrounds, interesting narratives)
- What a given market's pricing implies, and whether it looks mispriced vs. fundamentals
- Cross-book arbitrage candidates (overround > 1.0 on a single book, or price gaps across books)
- Bet sizing (Kelly criterion, bankroll management) when a position is in scope

Tone: direct, quantitative, professional. Cite specific markets and numbers from the snapshot below when it helps. Don't hedge excessively — the user is here because they want your take. When you're not sure, say so concretely ("no volume data for this market" vs. "I'm not confident").

Important guardrails:
- Never claim an "arbitrage FOUND" unless you can demonstrate both legs with real prices. Overround > 1.0 on a single book is a *candidate* worth manual verification, not an executable arb.
- If the user asks about something not in the snapshot (e.g. a market not listed, or historical data), say so — don't hallucinate prices.
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

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json(
      {
        role: 'assistant',
        content:
          "O'Toole is offline — `ANTHROPIC_API_KEY` isn't set on this deployment yet. Ask your admin to wire it up and I'll be right with you.",
        stub: true,
      },
      { status: 200 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: unknown }
  const messages = Array.isArray(body.messages) ? (body.messages as unknown[]) : []
  const cleaned: ChatMessage[] = []
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue
    const role = (m as { role?: unknown }).role
    const content = (m as { content?: unknown }).content
    if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()) {
      cleaned.push({ role, content: content.trim() })
    }
  }
  if (cleaned.length === 0) {
    return Response.json({ error: 'empty_messages' }, { status: 400 })
  }
  if (cleaned[0].role !== 'user') {
    return Response.json({ error: 'first_message_must_be_user' }, { status: 400 })
  }

  // Load market context for the system prompt.
  let marketContext: string
  try {
    const { markets, dataDate } = await loadMarkets({ pageSize: 10_000 })
    marketContext = formatMarketContext(markets, dataDate)
  } catch (err) {
    console.error('[otoole/chat] market load failed', err)
    marketContext = '(market snapshot unavailable — the scraper data may not be mounted in this environment)'
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: [
        { type: 'text', text: OTOOLE_PERSONA },
        { type: 'text', text: marketContext, cache_control: { type: 'ephemeral' } },
      ],
      messages: cleaned,
    })

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n\n')

    // Record usage AFTER a successful response so failed requests don't count
    // against the user's daily cap. We await it so the response headers
    // reflect the post-increment count, but don't fail the request if the
    // DB write falls over.
    let usedAfter = cap.count + 1
    try {
      usedAfter = await incrementAndGetCount(user.id, {
        input: response.usage.input_tokens ?? 0,
        output: response.usage.output_tokens ?? 0,
      })
    } catch (err) {
      console.error('[otoole/chat] usage increment failed', err)
    }

    return Response.json({
      role: 'assistant',
      content: text || '(O\'Toole returned an empty response — try rephrasing?)',
      usage: {
        input: response.usage.input_tokens,
        cached_read: response.usage.cache_read_input_tokens,
        cached_write: response.usage.cache_creation_input_tokens,
        output: response.usage.output_tokens,
      },
      cap: {
        used: usedAfter,
        limit: cap.cap,
        tier: cap.tier,
        resetsInSeconds: cap.resetsInSeconds,
      },
    })
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: 'rate_limit', message: 'Too many requests — wait a moment and try again.' },
        { status: 429 },
      )
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: 'auth_failed', message: 'ANTHROPIC_API_KEY rejected.' }, { status: 500 })
    }
    if (err instanceof Anthropic.APIError) {
      console.error('[otoole/chat] Anthropic API error', err.status, err.message)
      return Response.json(
        { error: 'api_error', message: `Anthropic API ${err.status}: ${err.message}` },
        { status: 500 },
      )
    }
    console.error('[otoole/chat] unknown error', err)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
}
