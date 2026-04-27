import type { ToolDefinition, ToolExecutor } from './ai-providers/types'
import { loadAllLatestSnapshots, loadMarketHistory, type MarketSnapshot } from './markets-data'
import { findCrossBookPairs } from './arb-scanner'
import { loadMinuteMarkets } from './minute-markets'
import { getServerClient } from './supabase-server'
import {
  ruleCapFor,
  validateChannels,
  validateCooldown,
  validateMarketFilter,
  validateTriggerConfig,
} from './alerts/validate'
import type { TriggerType, Channel } from './alerts/types'

// Tools O'Toole can call mid-chat. Two flavors:
//   • READ tools (find_arbs, get_minute_markets, get_market, search_markets)
//     — pure data fetchers; no auth needed beyond what the chat already has.
//   • WRITE / USER-SCOPED tools (alert rule CRUD, recent activity, propose_trade)
//     — must know which user is asking. The chat route builds an executor
//     bound to the user's context via createOtooleToolExecutor(ctx).
//
// The legacy `executeOtooleTool` export remains for callers that only need
// read tools. Write tools route through the contextful factory.
//
// Adding a new tool: declare its schema in `OTOOLE_TOOLS` and add a case in
// the executor. Keep schemas tight, response payloads small (< ~4 KB), and
// errors narrow ("market not found" beats "tool error: foo bar baz").

const MAX_RESPONSE_CHARS = 4_000

export const OTOOLE_TOOLS: ToolDefinition[] = [
  {
    name: 'find_arbs',
    description:
      'Find current cross-book arbitrage candidates across sportsbook moneylines. ' +
      'Returns an array of { sport, away, home, startsAt, sum, edgePp, cheapestHome, cheapestAway, books }. ' +
      'edgePp > 0 means the sum of cheapest-home + cheapest-away asks is < $1.00 — a real arb before fees. ' +
      'Use this when the user asks "any arbs?" or "what should I look at right now?".',
    input_schema: {
      type: 'object',
      properties: {
        sport: {
          type: 'string',
          description: 'Filter to a single sport (basketball/baseball/hockey/football/soccer). Omit for all.',
        },
        min_edge_pp: {
          type: 'number',
          description: 'Minimum edge in percentage points. Default 0 (any arb). Set to e.g. 1 to filter out break-even-after-fees.',
        },
        include_near_arbs: {
          type: 'boolean',
          description: 'If true, also returns rows with sum 1.00–1.02 (near-arbs worth watching). Default false.',
        },
        limit: {
          type: 'number',
          description: 'Max rows to return. Default 10, hard cap 25.',
        },
      },
    },
  },
  {
    name: 'get_minute_markets',
    description:
      'Get crypto minute markets (sub-60min resolution) currently active across Limitless / OG / Kalshi. ' +
      'Returns groups of (asset, resolution_time) with the strike ladder per platform. Use when the user asks ' +
      '"what\'s about to settle?", "any quick crypto plays?", or "what\'s happening with BTC/ETH right now?".',
    input_schema: {
      type: 'object',
      properties: {
        within_minutes: {
          type: 'number',
          description: 'Time window in minutes from now. Default 60, hard cap 240.',
        },
        asset: {
          type: 'string',
          description:
            'Filter to a single asset symbol (BTC, ETH, SOL, XRP, DOGE, LTC, etc.). Omit for all.',
        },
      },
    },
  },
  {
    name: 'get_market',
    description:
      'Fetch full detail on a single market including all outcomes, prices, volume, freshness, and recent ' +
      'price history (last 7 days of snapshots). Use when the user asks "what\'s the price on X right now" ' +
      'or "show me the BTC > $80k market on Limitless." Requires a platform AND a platform_market_id — the ' +
      'find_arbs and get_minute_markets tools both return these IDs you can pass through.',
    input_schema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description: 'Source platform (kalshi, polymarket, limitless, og, novig, prophetx, etc.).',
        },
        platform_market_id: {
          type: 'string',
          description: 'The platform-native market id, exactly as it appeared in another tool result.',
        },
      },
      required: ['platform', 'platform_market_id'],
    },
  },
  {
    name: 'search_markets',
    description:
      'Free-text search across question / market_id of every currently-tracked market. Useful when the user ' +
      'mentions a player or team or topic by name ("Shohei Ohtani", "BTC > 80k", "Lakers championship") and ' +
      "you don't have the exact market ID yet. Returns up to 10 matches with their platform + ID + price.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text to search for (case-insensitive substring match against question + market_id).',
        },
        sport: {
          type: 'string',
          description: 'Optional sport filter to narrow results.',
        },
      },
      required: ['query'],
    },
  },

  // ── Strategy-scaffolding (Phase 1A — user-scoped) ─────────────────────────
  {
    name: 'list_my_alert_rules',
    description:
      "List the user's current alert rules — both user-created and O'Toole-managed. Use this BEFORE proposing " +
      'a new rule to check whether a similar one already exists; suggest editing the existing rule instead of ' +
      'creating a duplicate. Returns the rule id, name, trigger_type, trigger_config, market_filter, enabled ' +
      'status, last_fired_at, and created_by (user|otoole).',
    input_schema: {
      type: 'object',
      properties: {
        only_otoole: {
          type: 'boolean',
          description:
            'If true, return only rules where created_by = otoole. Default false (return all). ' +
            "Useful when O'Toole wants to manage just its own subset.",
        },
      },
    },
  },
  {
    name: 'create_alert_rule',
    description:
      "Create a new O'Toole-managed alert rule. Counts against the user's per-tier rule cap (Free=0, Pro=10, " +
      'Elite=50, Business=100, Fraternity=20). The rule is set to created_by = otoole automatically. Returns ' +
      'the new rule_id on success.\n\n' +
      'trigger_config shape varies by trigger_type:\n' +
      "  • price_threshold: { direction: 'above'|'below', threshold: 0..1 }\n" +
      '  • price_movement: { delta_pp: 5..90, window_minutes: 5|15|60|360|1440|10080 }\n' +
      "  • overround_threshold: { direction: 'above'|'below', threshold: 1.00..1.30 }\n" +
      '  • arb_appearance: { min_edge_pp?: number|null }\n\n' +
      'market_filter narrows which markets the rule watches: { platform?, sport?, category?, market_key? }. ' +
      "Pin to one market with market_key = 'platform:platform_market_id'. Empty filter = all markets.",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short human label, e.g. "BTC > $80k below 30¢"' },
        description: { type: 'string', description: 'Optional longer rationale.' },
        trigger_type: {
          type: 'string',
          enum: ['price_threshold', 'price_movement', 'overround_threshold', 'arb_appearance'],
        },
        trigger_config: { type: 'object', description: 'Per-trigger config; shape depends on trigger_type.' },
        market_filter: { type: 'object', description: 'Narrow which markets the rule watches.' },
        channels: {
          type: 'array',
          description:
            "Where to send the notification when the rule fires. Default ['browser_push','email'].",
        },
        cooldown_minutes: {
          type: 'number',
          description: 'Minimum minutes between consecutive fires for this rule. Min 5. Default 60.',
        },
      },
      required: ['name', 'trigger_type', 'trigger_config'],
    },
  },
  {
    name: 'update_alert_rule',
    description:
      "Update fields on an existing alert rule. SAFETY GATE: only rules with created_by = otoole can be " +
      "modified. User-created rules (created_by = user) are read-only from O'Toole's side — if the user " +
      'wants to refactor one of those, propose a new rule and ask them to delete the old one manually. ' +
      'Pass rule_id plus only the fields you want to change.',
    input_schema: {
      type: 'object',
      properties: {
        rule_id: { type: 'string', description: 'The id from list_my_alert_rules.' },
        name: { type: 'string' },
        description: { type: 'string' },
        trigger_config: { type: 'object' },
        market_filter: { type: 'object' },
        channels: { type: 'array' },
        cooldown_minutes: { type: 'number' },
        enabled: { type: 'boolean' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'delete_alert_rule',
    description:
      "Delete an alert rule. Same safety gate as update_alert_rule — only created_by = otoole rules can be " +
      'deleted via this tool. Confirm with the user before deleting; once gone, firing history is also gone ' +
      '(alert_events cascades).',
    input_schema: {
      type: 'object',
      properties: {
        rule_id: { type: 'string' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'get_my_recent_activity',
    description:
      "Fetch the user's last ~50 click events + market_view events from the last 7 days. Useful for " +
      'personalization — if they\'ve been viewing BTC markets and you spot a BTC arb, mention the connection. ' +
      'Returns: top events by name, recent market detail page visits, recent venue_cta_click count.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'How far back to look. Default 7, max 30.' },
      },
    },
  },
  {
    name: 'propose_trade',
    description:
      'Propose a trade for the user to confirm. Writes a row to trade_drafts with status = pending. The ' +
      "dashboard renders pending drafts with Confirm / Cancel buttons. NO real order is placed by this tool " +
      "— execution lives in a separate phase that requires the user's explicit confirm. Use this when the " +
      "user has expressed clear intent to trade or when you've identified a high-edge arb worth surfacing.\n\n" +
      'Always include a rationale explaining your reasoning (this is the audit trail).',
    input_schema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description: 'Source platform (kalshi, polymarket, limitless, og, etc.).',
        },
        platform_market_id: { type: 'string', description: 'Platform-native market id.' },
        outcome_name: { type: 'string', description: "Which outcome — typically 'Yes' or 'No'." },
        side: { type: 'string', enum: ['buy', 'sell'] },
        size_usd: {
          type: 'number',
          description: 'USD-equivalent stake. Hard ceiling $10,000. Be conservative on first proposals.',
        },
        max_price: {
          type: 'number',
          description:
            'Limit ceiling 0..1. The execution router will not fill above this price. Tight limits = better ' +
            'protection against slippage but higher chance of missing a fast-moving market.',
        },
        rationale: {
          type: 'string',
          description:
            "Plain-English reason. E.g. 'Cross-book arb edge 3.2pp; OG cheaper YES vs Kalshi NO.'",
        },
        ttl_minutes: {
          type: 'number',
          description: 'How long the proposal remains pending before expiring. Default 15, max 60.',
        },
      },
      required: ['platform', 'platform_market_id', 'outcome_name', 'side', 'size_usd', 'max_price', 'rationale'],
    },
  },
]

function clip(s: string): string {
  if (s.length <= MAX_RESPONSE_CHARS) return s
  return s.slice(0, MAX_RESPONSE_CHARS) + `\n…(truncated; raw response was ${s.length} chars)`
}

function jsonOk(data: unknown): { content: string; isError?: boolean } {
  return { content: clip(JSON.stringify(data, null, 2)) }
}

function jsonErr(message: string): { content: string; isError?: boolean } {
  return { content: JSON.stringify({ error: message }), isError: true }
}

function topYesAsk(s: MarketSnapshot): number | null {
  const yes = s.outcomes.find((o) => /^yes\b|\byes\s/i.test(o.name)) ?? s.outcomes[0]
  return yes?.best_ask ?? null
}

/**
 * Per-request user context. Threaded into the tool executor so user-scoped
 * tools (alert-rule CRUD, propose_trade, get_my_recent_activity) know which
 * user they're acting on without re-authenticating per call.
 */
export interface OtooleToolContext {
  authUserId: string
  email: string
  tier: 'free' | 'pro' | 'elite' | 'business'
  /** waitlist.id — primary key the alert_rules + trade_drafts tables use.
   *  null when the user isn't on the waitlist (rare; user-scoped writes will
   *  return a clear error in that case). */
  waitlistId: string | null
  /** business subtype for fraternity rule cap. Optional; route may not have it. */
  businessSubtype?: 'standard' | 'fraternity' | null
}

const READ_ONLY_TOOLS = new Set([
  'find_arbs',
  'get_minute_markets',
  'get_market',
  'search_markets',
])

/**
 * Build a tool executor bound to one user's context. Read-only tools work
 * regardless of context; write/user-scoped tools require waitlistId.
 */
export function createOtooleToolExecutor(ctx: OtooleToolContext): ToolExecutor {
  return (toolName, rawInput) => execute(toolName, rawInput, ctx)
}

/**
 * Legacy no-context executor — handles read-only tools only. Calling a
 * user-scoped tool through this path returns a clear error rather than
 * falling through to undefined behavior. Kept for tests + tools that
 * genuinely don't need a user.
 */
export const executeOtooleTool: ToolExecutor = (toolName, rawInput) =>
  execute(toolName, rawInput, null)

async function execute(
  toolName: string,
  rawInput: unknown,
  ctx: OtooleToolContext | null,
): Promise<{ content: string; isError?: boolean }> {
  if (!READ_ONLY_TOOLS.has(toolName) && !ctx) {
    return jsonErr(
      `Tool "${toolName}" requires user context. Build the executor with createOtooleToolExecutor(ctx).`,
    )
  }
  const input = (rawInput ?? {}) as Record<string, unknown>
  try {
    switch (toolName) {
      // ──────────────────────────────────────────────────────────── find_arbs
      case 'find_arbs': {
        const sport =
          typeof input.sport === 'string' ? input.sport.toLowerCase().trim() : null
        const minEdgePp = typeof input.min_edge_pp === 'number' ? input.min_edge_pp : 0
        const includeNear = input.include_near_arbs === true
        const limit = Math.min(
          25,
          Math.max(1, typeof input.limit === 'number' ? input.limit : 10),
        )

        const { snapshots } = await loadAllLatestSnapshots()
        const pairs = findCrossBookPairs(snapshots, { maxQuoteSkewMinutes: 10 })
        const filtered = pairs
          .filter((p) => p.bestSum != null)
          .filter((p) => (sport ? p.sport === sport : true))
          .filter((p) => {
            const edgePp = (1 - p.bestSum!) * 100
            if (includeNear && edgePp >= -2) return true
            return edgePp >= minEdgePp
          })
          .sort((a, b) => (a.bestSum ?? 1) - (b.bestSum ?? 1))
          .slice(0, limit)
          .map((p) => ({
            sport: p.sport,
            away: p.away,
            home: p.home,
            startsAt: p.startsAt,
            sum: Number((p.bestSum ?? 0).toFixed(4)),
            edgePp: Number(((1 - (p.bestSum ?? 1)) * 100).toFixed(2)),
            cheapestHome: p.cheapestHome,
            cheapestAway: p.cheapestAway,
            books: p.quotes.map((q) => q.platform),
            isArb: p.isArb,
          }))
        return jsonOk({ count: filtered.length, results: filtered })
      }

      // ──────────────────────────────────────────────────── get_minute_markets
      case 'get_minute_markets': {
        const within = Math.min(
          240,
          Math.max(1, typeof input.within_minutes === 'number' ? input.within_minutes : 60),
        )
        const asset = typeof input.asset === 'string' ? input.asset : null
        const result = await loadMinuteMarkets({
          within,
          asset,
          grouped: true,
          cryptoOnly: true,
        })
        const groups = (result.groups ?? []).slice(0, 10).map((g) => ({
          asset: g.asset,
          resolves_at: g.resolves_at,
          minutes_to_resolve: g.minutes_to_resolve,
          bucket: g.bucket,
          platforms: g.platforms,
          market_count: g.market_count,
          strike_min: g.strike_min,
          strike_max: g.strike_max,
          // Top 6 strikes per group, just enough for the model to compare.
          markets: g.markets.slice(0, 6).map((m) => ({
            platform: m.platform,
            platform_market_id: m.market_id,
            strike: m.strike,
            direction: m.direction,
            yes_ask: m.outcomes.find((o) => /^yes/i.test(o.name))?.best_ask ?? m.outcomes[0]?.best_ask ?? null,
            volume: m.volume,
            change_5m: m.change_5m,
          })),
        }))
        return jsonOk({
          window_minutes: within,
          asset_filter: result.assetFilter,
          total_markets: result.totalMarkets,
          group_count: groups.length,
          assets_available: result.assetsAvailable,
          groups,
        })
      }

      // ────────────────────────────────────────────────────────── get_market
      case 'get_market': {
        const platform = typeof input.platform === 'string' ? input.platform.toLowerCase() : ''
        const id = typeof input.platform_market_id === 'string' ? input.platform_market_id : ''
        if (!platform || !id) return jsonErr('Both platform and platform_market_id are required.')

        const { snapshots } = await loadAllLatestSnapshots()
        const m = snapshots.find(
          (s) => s.platform === platform && s.platform_market_id === id,
        )
        if (!m) {
          return jsonErr(
            `No current snapshot for ${platform}:${id}. Either the market resolved/closed or the platform_market_id is wrong.`,
          )
        }

        // Pull last 7d of snapshots for this market — gives the model drift context.
        const histories = await loadMarketHistory(7)
        const hist = histories.find(
          (h) => h.platform === platform && h.platform_market_id === id,
        )
        const series = (hist?.snapshots ?? []).slice(-30).map((s) => ({
          ts: s.ts,
          yes_ask: topYesAsk(s),
          overround: s.overround,
        }))

        return jsonOk({
          platform: m.platform,
          platform_market_id: m.platform_market_id,
          question: m.question,
          sport: m.sport,
          outcomes: m.outcomes,
          overround: m.overround,
          volume: m.volume_traded,
          liquidity: m.liquidity,
          starts_at: m.starts_at,
          resolves_at: m.resolves_at,
          phase: m.phase,
          ts: m.ts,
          recent_history: series,
          history_points: series.length,
        })
      }

      // ──────────────────────────────────────────────────── search_markets
      case 'search_markets': {
        const q = typeof input.query === 'string' ? input.query.toLowerCase().trim() : ''
        if (!q || q.length < 2) return jsonErr('Query must be at least 2 characters.')
        const sport =
          typeof input.sport === 'string' ? input.sport.toLowerCase().trim() : null

        const { snapshots } = await loadAllLatestSnapshots()
        const matches = snapshots
          .filter((s) =>
            s.question.toLowerCase().includes(q) ||
            s.platform_market_id.toLowerCase().includes(q),
          )
          .filter((s) => (sport ? (s.sport ?? '').toLowerCase() === sport : true))
          .slice(0, 10)
          .map((s) => ({
            platform: s.platform,
            platform_market_id: s.platform_market_id,
            question: s.question,
            sport: s.sport,
            yes_ask: topYesAsk(s),
            overround: s.overround,
            volume: s.volume_traded,
            phase: s.phase,
            ts: s.ts,
          }))
        return jsonOk({ count: matches.length, query: q, results: matches })
      }

      // ────────────────────────────────────────────────── list_my_alert_rules
      case 'list_my_alert_rules': {
        if (!ctx?.waitlistId) {
          return jsonErr(
            "User is not on the waitlist (no waitlist row), so no alert rules to list. Suggest the user " +
              'create an account before configuring alerts.',
          )
        }
        const onlyOtoole = input.only_otoole === true
        const admin = getServerClient()
        let q = admin
          .from('alert_rules')
          .select(
            'id, name, description, trigger_type, trigger_config, market_filter, channels, ' +
              'cooldown_minutes, enabled, last_fired_at, created_at, updated_at, created_by',
          )
          .eq('user_id', ctx.waitlistId)
        if (onlyOtoole) q = q.eq('created_by', 'otoole')
        const { data, error } = await q.order('created_at', { ascending: false }).limit(50)
        if (error) return jsonErr(`alert_rules lookup failed: ${error.message}`)
        const rules = data ?? []
        const cap = ruleCapFor(ctx.tier, ctx.businessSubtype ?? null)
        return jsonOk({
          rule_count: rules.length,
          tier: ctx.tier,
          tier_rule_cap: cap,
          rules,
        })
      }

      // ──────────────────────────────────────────────────── create_alert_rule
      case 'create_alert_rule': {
        if (!ctx?.waitlistId) {
          return jsonErr('User is not on the waitlist; cannot create alert rules.')
        }
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        if (!name || name.length > 120) {
          return jsonErr('name is required (1-120 chars).')
        }
        const description =
          typeof input.description === 'string' ? input.description.slice(0, 500) : null
        const triggerType = input.trigger_type as TriggerType
        if (
          triggerType !== 'price_threshold' &&
          triggerType !== 'price_movement' &&
          triggerType !== 'overround_threshold' &&
          triggerType !== 'arb_appearance'
        ) {
          return jsonErr(`trigger_type must be one of price_threshold, price_movement, overround_threshold, arb_appearance.`)
        }
        const triggerConfigErr = validateTriggerConfig(triggerType, input.trigger_config)
        if (triggerConfigErr) return jsonErr(`trigger_config: ${triggerConfigErr.message}`)
        const marketFilter = input.market_filter ?? {}
        const marketFilterErr = validateMarketFilter(marketFilter)
        if (marketFilterErr) return jsonErr(`market_filter: ${marketFilterErr.message}`)
        const channels = (input.channels ?? ['browser_push', 'email']) as Channel[]
        const channelsErr = validateChannels(channels)
        if (channelsErr) return jsonErr(`channels: ${channelsErr.message}`)
        const cooldown = typeof input.cooldown_minutes === 'number' ? input.cooldown_minutes : 60
        const cooldownErr = validateCooldown(cooldown)
        if (cooldownErr) return jsonErr(`cooldown_minutes: ${cooldownErr.message}`)

        // Tier rule-cap check.
        const admin = getServerClient()
        const cap = ruleCapFor(ctx.tier, ctx.businessSubtype ?? null)
        if (cap === 0) {
          return jsonErr(
            `The ${ctx.tier} tier has no alert-rule capacity. Free users can use the platform but can't ` +
              'create persistent rules — suggest upgrading to Pro.',
          )
        }
        const { count } = await admin
          .from('alert_rules')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', ctx.waitlistId)
        if (cap !== Infinity && (count ?? 0) >= cap) {
          return jsonErr(
            `User is at their tier cap (${cap} rules). Suggest deleting an old rule before creating a new one, ` +
              'or upgrading the tier.',
          )
        }

        const { data, error } = await admin
          .from('alert_rules')
          .insert({
            user_id: ctx.waitlistId,
            name,
            description,
            trigger_type: triggerType,
            trigger_config: input.trigger_config as object,
            market_filter: marketFilter as object,
            channels,
            cooldown_minutes: cooldown,
            enabled: true,
            created_by: 'otoole',
          })
          .select('id, name, trigger_type, created_at')
          .single()
        if (error) return jsonErr(`insert failed: ${error.message}`)
        return jsonOk({
          ok: true,
          rule_id: data?.id,
          rule: data,
          message:
            "Rule created. It will start firing per the cron evaluator on the user's next cycle. Tell the user " +
            "they can review it under /dashboard/alerts.",
        })
      }

      // ──────────────────────────────────────────────────── update_alert_rule
      case 'update_alert_rule': {
        if (!ctx?.waitlistId) return jsonErr('User is not on the waitlist; cannot update alert rules.')
        const ruleId = typeof input.rule_id === 'string' ? input.rule_id : ''
        if (!ruleId) return jsonErr('rule_id is required.')

        const admin = getServerClient()
        // SAFETY: scope to (user_id, rule_id, created_by='otoole'). User-created
        // rules are read-only from O'Toole's side.
        const { data: existing, error: lookupErr } = await admin
          .from('alert_rules')
          .select('id, created_by')
          .eq('id', ruleId)
          .eq('user_id', ctx.waitlistId)
          .maybeSingle()
        if (lookupErr) return jsonErr(`lookup failed: ${lookupErr.message}`)
        if (!existing)
          return jsonErr("Rule not found, or it belongs to a different user.")
        if (existing.created_by !== 'otoole') {
          return jsonErr(
            "This rule was created by the user (created_by != 'otoole'). O'Toole cannot mutate user-created " +
              'rules — refusing for safety. Suggest the user edit it in /dashboard/alerts directly, or create a ' +
              'new O\'Toole-managed rule with similar logic.',
          )
        }

        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (typeof input.name === 'string') patch.name = input.name.trim().slice(0, 120)
        if (typeof input.description === 'string') patch.description = input.description.slice(0, 500)
        if (input.trigger_config !== undefined) {
          // Need the existing trigger_type for validation (not changing type via update).
          const { data: row } = await admin
            .from('alert_rules')
            .select('trigger_type')
            .eq('id', ruleId)
            .single()
          const tt = row?.trigger_type as TriggerType
          const err = validateTriggerConfig(tt, input.trigger_config)
          if (err) return jsonErr(`trigger_config: ${err.message}`)
          patch.trigger_config = input.trigger_config
        }
        if (input.market_filter !== undefined) {
          const err = validateMarketFilter(input.market_filter)
          if (err) return jsonErr(`market_filter: ${err.message}`)
          patch.market_filter = input.market_filter
        }
        if (input.channels !== undefined) {
          const err = validateChannels(input.channels)
          if (err) return jsonErr(`channels: ${err.message}`)
          patch.channels = input.channels
        }
        if (typeof input.cooldown_minutes === 'number') {
          const err = validateCooldown(input.cooldown_minutes)
          if (err) return jsonErr(`cooldown_minutes: ${err.message}`)
          patch.cooldown_minutes = input.cooldown_minutes
        }
        if (typeof input.enabled === 'boolean') patch.enabled = input.enabled

        const { error: updErr } = await admin
          .from('alert_rules')
          .update(patch)
          .eq('id', ruleId)
        if (updErr) return jsonErr(`update failed: ${updErr.message}`)
        return jsonOk({ ok: true, rule_id: ruleId, fields_updated: Object.keys(patch) })
      }

      // ──────────────────────────────────────────────────── delete_alert_rule
      case 'delete_alert_rule': {
        if (!ctx?.waitlistId) return jsonErr('User is not on the waitlist; cannot delete alert rules.')
        const ruleId = typeof input.rule_id === 'string' ? input.rule_id : ''
        if (!ruleId) return jsonErr('rule_id is required.')

        const admin = getServerClient()
        const { data: existing, error: lookupErr } = await admin
          .from('alert_rules')
          .select('id, name, created_by')
          .eq('id', ruleId)
          .eq('user_id', ctx.waitlistId)
          .maybeSingle()
        if (lookupErr) return jsonErr(`lookup failed: ${lookupErr.message}`)
        if (!existing) return jsonErr('Rule not found, or it belongs to a different user.')
        if (existing.created_by !== 'otoole') {
          return jsonErr(
            "This rule was created by the user. O'Toole cannot delete user-created rules — refusing for safety.",
          )
        }
        const { error: delErr } = await admin
          .from('alert_rules')
          .delete()
          .eq('id', ruleId)
          .eq('user_id', ctx.waitlistId) // belt + suspenders
          .eq('created_by', 'otoole') // belt + suspenders
        if (delErr) return jsonErr(`delete failed: ${delErr.message}`)
        return jsonOk({ ok: true, rule_id: ruleId, deleted_name: existing.name })
      }

      // ─────────────────────────────────────────────── get_my_recent_activity
      case 'get_my_recent_activity': {
        if (!ctx) return jsonErr('User context required.')
        const days = Math.min(
          30,
          Math.max(1, typeof input.days === 'number' ? input.days : 7),
        )
        const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        const admin = getServerClient()
        const { data, error } = await admin
          .from('click_events')
          .select('event_name, page, target, ts, metadata')
          .eq('user_id', ctx.authUserId)
          .gte('ts', sinceIso)
          .order('ts', { ascending: false })
          .limit(50)
        if (error) return jsonErr(`click_events lookup failed: ${error.message}`)
        const events = (data ?? []) as Array<{
          event_name: string
          page: string | null
          target: string | null
          ts: string
          metadata: Record<string, unknown> | null
        }>
        if (events.length === 0) {
          return jsonOk({
            event_count: 0,
            top_events: [],
            recent_market_views: [],
            trade_intent_count: 0,
            note: 'No activity recorded in this window — answer without personalization.',
          })
        }
        const counts = new Map<string, number>()
        for (const e of events) counts.set(e.event_name, (counts.get(e.event_name) ?? 0) + 1)
        const topEvents = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([name, count]) => ({ name, count }))
        const marketViews = events
          .filter((e) => e.event_name === 'page_view' && /\/markets\//.test(e.page ?? ''))
          .slice(0, 10)
          .map((e) => ({ page: e.page, ts: e.ts }))
        const tradeIntents = events.filter((e) => e.event_name === 'venue_cta_click').length
        return jsonOk({
          window_days: days,
          event_count: events.length,
          top_events: topEvents,
          recent_market_views: marketViews,
          trade_intent_count: tradeIntents,
        })
      }

      // ───────────────────────────────────────────────────────── propose_trade
      case 'propose_trade': {
        if (!ctx?.waitlistId)
          return jsonErr('User is not on the waitlist; cannot propose trades.')
        const platform = typeof input.platform === 'string' ? input.platform.toLowerCase().trim() : ''
        const marketId = typeof input.platform_market_id === 'string' ? input.platform_market_id : ''
        const outcomeName = typeof input.outcome_name === 'string' ? input.outcome_name : ''
        const side = input.side === 'buy' || input.side === 'sell' ? input.side : null
        const sizeUsd = typeof input.size_usd === 'number' ? input.size_usd : NaN
        const maxPrice = typeof input.max_price === 'number' ? input.max_price : NaN
        const rationale = typeof input.rationale === 'string' ? input.rationale.slice(0, 1000) : ''
        const ttl = Math.min(
          60,
          Math.max(1, typeof input.ttl_minutes === 'number' ? input.ttl_minutes : 15),
        )

        if (!platform || !marketId) return jsonErr('platform and platform_market_id required.')
        if (!outcomeName) return jsonErr('outcome_name required.')
        if (!side) return jsonErr('side must be "buy" or "sell".')
        if (!Number.isFinite(sizeUsd) || sizeUsd <= 0 || sizeUsd > 10_000)
          return jsonErr('size_usd must be > 0 and <= 10,000.')
        if (!Number.isFinite(maxPrice) || maxPrice <= 0 || maxPrice > 1)
          return jsonErr('max_price must be in (0, 1].')
        if (!rationale) return jsonErr('rationale is required for the audit trail.')

        // Verify the market exists in the current snapshot. If we can't find
        // it, the proposal would point at nothing — better to fail now.
        const { snapshots } = await loadAllLatestSnapshots()
        const market = snapshots.find(
          (s) => s.platform === platform && s.platform_market_id === marketId,
        )
        if (!market) {
          return jsonErr(
            `No current snapshot for ${platform}:${marketId}. Verify with search_markets or get_market before ` +
              'proposing.',
          )
        }
        const outcome = market.outcomes.find((o) => o.name === outcomeName)
        if (!outcome) {
          return jsonErr(
            `Outcome "${outcomeName}" not found on ${platform}:${marketId}. Outcomes: ` +
              market.outcomes.map((o) => o.name).join(', '),
          )
        }

        const admin = getServerClient()
        const { data, error } = await admin
          .from('trade_drafts')
          .insert({
            user_id: ctx.waitlistId,
            proposed_by: 'otoole',
            platform,
            platform_market_id: marketId,
            outcome_name: outcomeName,
            side,
            size_usd: sizeUsd,
            max_price: maxPrice,
            rationale,
            ttl_minutes: ttl,
            status: 'pending',
            metadata: {
              market_question: market.question,
              market_yes_ask:
                market.outcomes.find((o) => /^yes/i.test(o.name))?.best_ask ?? null,
              proposed_at_iso: new Date().toISOString(),
            },
          })
          .select('id, created_at')
          .single()
        if (error) return jsonErr(`trade_drafts insert failed: ${error.message}`)
        return jsonOk({
          ok: true,
          draft_id: data?.id,
          created_at: data?.created_at,
          ttl_minutes: ttl,
          message:
            'Draft proposed. The user will see it on their dashboard with confirm/cancel buttons. ' +
            'NO order has been placed — execution requires their explicit confirm. Tell them why this is ' +
            'a good trade in plain language.',
        })
      }

      default:
        return jsonErr(`Unknown tool: ${toolName}`)
    }
  } catch (err) {
    return jsonErr(`Tool error: ${(err as Error).message}`)
  }
}
