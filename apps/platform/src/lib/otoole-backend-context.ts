import { AI_MODELS } from './ai-models'
import { CREDIT_PACKS } from './credits'
import { VENUES, CATEGORY_LABELS } from './venues'

/**
 * Generates the "Sneakers backend knowledge" block that gets injected into
 * O'Toole's system prompt. This is Layer 1 (global/shared) per the
 * `docs/OTOOLE_TENANT_ISOLATION.md` contract — safe to cache across all
 * tenants because it contains nothing user- or tenant-specific.
 *
 * All content is derived from canonical source-of-truth catalogs (VENUES,
 * AI_MODELS, CREDIT_PACKS) so when those change, O'Toole's knowledge stays
 * in sync without manual prompt edits.
 *
 * Keep this focused: we're trying to make O'Toole answer "what books do
 * you track?" / "what does a Sonnet message cost?" accurately — NOT turn
 * it into a marketing bot. Don't add fluff.
 */
export function formatSneakersContext(): string {
  const sections: string[] = []

  sections.push('# Sneakers platform — backend knowledge for O\'Toole')
  sections.push('')
  sections.push(
    'You are embedded in Sneakers Terminal, a Bloomberg-style aggregator for prediction markets and sports betting. ' +
    'Use this context when users ask about the platform itself (which books we track, pricing, how credits work, etc.). ' +
    'For anything not covered here, say you don\'t have that info rather than invent.'
  )
  sections.push('')

  // ── Venue catalog ─────────────────────────────────────────────────
  sections.push('## Venues we track')
  sections.push('')

  const byCategory = new Map<string, typeof VENUES>()
  for (const v of VENUES) {
    const key = v.category
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key)!.push(v)
  }

  for (const [category, venues] of byCategory.entries()) {
    const label = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category
    sections.push(`### ${label}`)
    for (const v of venues) {
      const statusTag =
        v.status === 'live' ? 'LIVE' :
        v.status === 'coming_soon' ? 'coming soon' :
        'requested'
      const wrapper = v.wrapperOf ? ` (wraps ${v.wrapperOf} — same prices)` : ''
      sections.push(`- **${v.name}** — ${statusTag}${wrapper}. ${v.blurb}`)
    }
    sections.push('')
  }

  const liveCount = VENUES.filter((v) => v.status === 'live').length
  const comingCount = VENUES.filter((v) => v.status === 'coming_soon').length
  sections.push(
    `Totals: ${VENUES.length} venues tracked — ${liveCount} LIVE, ${comingCount} coming soon, ` +
    `${VENUES.length - liveCount - comingCount} in the request queue.`
  )
  sections.push('')

  // ── AI models + pricing ───────────────────────────────────────────
  sections.push('## AI models you (O\'Toole) can run as')
  sections.push('')
  sections.push(
    'Users pick a model from the dropdown in the chat widget. Each message costs credits based on the model, unless the user has brought their own API key for that provider.'
  )
  sections.push('')
  const enabledModels = AI_MODELS.filter((m) => m.enabled)
  for (const m of enabledModels) {
    sections.push(
      `- **${m.displayName}** (${m.provider}): ${m.creditCostPerMessage} credits/message, ` +
      `requires ${m.minTier}+ tier. ${m.tagline}`
    )
  }
  sections.push('')

  // ── Credit system ─────────────────────────────────────────────────
  sections.push('## How credits work')
  sections.push('')
  sections.push('Users buy credit packs at /dashboard/billing/credits. 1 credit ≈ $0.001 before margin.')
  sections.push('')
  for (const pack of CREDIT_PACKS) {
    const total = pack.credits + pack.bonus
    const bonusPct = pack.bonus > 0 ? Math.round((pack.bonus / pack.credits) * 100) : 0
    sections.push(
      `- **$${pack.usd}**: ${total.toLocaleString()} credits` +
      (bonusPct > 0 ? ` (${bonusPct}% bulk bonus included)` : '')
    )
  }
  sections.push('')
  sections.push('Credits never expire. They stack with subscription tiers. Refunds reverse credit grants.')
  sections.push('')
  sections.push(
    'BYO API keys (at /dashboard/settings/api-keys) let users bring their own Anthropic/OpenAI/Google/xAI key. ' +
    'When a user chats using a BYO-key provider, their message costs ZERO credits — they pay their provider directly.'
  )
  sections.push('')

  // ── Tier structure ────────────────────────────────────────────────
  sections.push('## Subscription tiers')
  sections.push('')
  sections.push('- **Free** ($0): 5 Haiku messages/day, basic market view (15-min delayed, top-100 markets).')
  sections.push('- **Pro** ($39/mo or $390/yr): real-time all markets, cross-venue arb scanner, unlimited alerts, 50 O\'Toole messages/day on any eligible model.')
  sections.push('- **Elite** ($99/mo or $990/yr): Pro + Opus access, REST API, historical export, backtesting, 500 O\'Toole messages/day.')
  sections.push('- **Business** ($299/mo or $2,990/yr): Elite + 10 team seats + white-label embed + priority support + 200 O\'Toole messages/day per seat.')
  sections.push('- **Fraternity** ($149/mo or $1,490/yr): same features as Business, 30 seats, for student orgs.')
  sections.push('- **Enterprise** (custom, contact sales): negotiated pricing, SLA, dedicated engineer.')
  sections.push('')
  sections.push('All paid plans have a 7-day trial (card required, 2 days for Business). Cancel anytime — access continues until the end of the billing period.')
  sections.push('')

  // ── Key routes ────────────────────────────────────────────────────
  sections.push('## Key routes on the platform')
  sections.push('')
  sections.push('- `/` — landing + waitlist (public)')
  sections.push('- `/venues` — public catalog of every book we track, with status + early-access signup')
  sections.push('- `/markets` — live market data (auth-gated), search + filter across every tracked book')
  sections.push('- `/dashboard` — user dashboard with market views, arbitrage panel, O\'Toole chat')
  sections.push('- `/dashboard/billing` — subscription tier management')
  sections.push('- `/dashboard/billing/credits` — buy credit packs, view balance + transaction history')
  sections.push('- `/dashboard/settings/api-keys` — bring-your-own-key settings per provider')
  sections.push('')

  sections.push('When a user asks about one of these topics (what\'s Pro cost? how do I bring my own key? what books do you have?) you can answer concretely from this context. When they ask about their PERSONAL state (their balance, their watchlists, their positions) that\'s user-scoped data — the server will inject it into a separate context block; answer based on what you see there, not from guesses.')

  return sections.join('\n')
}
