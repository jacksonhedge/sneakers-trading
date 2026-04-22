import { getAuthClient } from '@/lib/supabase-auth'
import { loadMarkets, type MarketSnapshot } from '@/lib/markets-data'
import { aggregateByCategory, categoryOf, type TerminalCategory } from '@/lib/market-stats'
import { checkDailyCap, incrementAndGetCount } from '@/lib/otoole-usage'
import { AI_MODELS, DEFAULT_MODEL, FREE_TIER_DEFAULT_MODEL, canUseModel, modelById, type AIModelMeta } from '@/lib/ai-models'
import { getBalance, spendCredits } from '@/lib/credits'
import { getAdapter, ChatAdapterError } from '@/lib/ai-providers'
import { getUserProviderKey } from '@/lib/provider-keys'
import { formatSneakersContext } from '@/lib/otoole-backend-context'

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

Your job: help serious bettors make sense of live prices across every book Sneakers tracks. You reason about:
- Which markets are worth looking at (high volume, wide overrounds, interesting narratives)
- What a given market's pricing implies, and whether it looks mispriced vs. fundamentals
- Cross-book arbitrage candidates (overround > 1.0 on a single book, or price gaps across books)
- Bet sizing (Kelly criterion, bankroll management) when a position is in scope
- Questions about Sneakers itself — books tracked, pricing, tier features, how credits work, etc. (answer from the backend-knowledge block below)

Tone: direct, quantitative, professional. Cite specific markets and numbers from the snapshot below when it helps. Don't hedge excessively — the user is here because they want your take. When you're not sure, say so concretely ("no volume data for this market" vs. "I'm not confident").

Important guardrails:
- Never claim an "arbitrage FOUND" unless you can demonstrate both legs with real prices. Overround > 1.0 on a single book is a *candidate* worth manual verification, not an executable arb.
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

  // Layer 1 platform knowledge — venues, models, credits, tiers, routes. Same
  // across every tenant; prepended to marketContext so it rides in the same
  // cached system block. Backend-context changes only when catalogs update
  // (rare), scraper marketContext changes every ~10 min — cache rewrite on
  // scrape cycle, cache hit within it. Keeps unit economics good.
  const platformContext = formatSneakersContext()
  const combinedContext = `${platformContext}\n\n---\n\n# Current market snapshot\n\n${marketContext}`

  // Route the request through the provider-agnostic adapter. The adapter
  // handles SDK-specific details (Anthropic's cache-control, OpenAI's
  // message shape, Google's systemInstruction, xAI's OpenAI-compatible
  // endpoint) and returns a uniform ChatResult.
  const adapter = getAdapter(model.provider)

  try {
    const result = await adapter.chat({
      modelId: model.id,
      systemPrompt: OTOOLE_PERSONA,
      marketContext: combinedContext,
      messages: cleaned,
      maxTokens: 2048,
      apiKey,
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
