import { loadAllLatestSnapshots, loadMarketHistory, type MarketHistory } from '../markets-data'
import { getServerClient } from '../supabase-server'
import { dispatchFire, type UserContext } from './dispatch'
import {
  applyMarketFilter,
  evaluateArbAppearance,
  evaluateOverround,
  evaluatePriceMovement,
  evaluatePriceThreshold,
} from './triggers'
import type { AlertRule, TriggerResult } from './types'

// Shared cron-evaluation core. /api/cron/evaluate-standard and
// /api/cron/evaluate-business both call runEvaluation with their tier set.
//
// Flow:
//   1. Snapshot fetch (latest + 1-day history) — once per cycle.
//   2. Per-tier waitlist scope: load enabled alert_rules + delivery prefs +
//      account_type/business_subtype + email.
//   3. Per rule: filter snapshots → call evaluator → cooldown check →
//      dispatch → record alert_event → bump last_fired_at.
//   4. Per cycle: log summary.
//
// Tier filter happens at the SQL layer — we only load rules whose owner is
// on a target tier AND has an active subscription_status (active/trialing).

export interface CronSummary {
  rules_evaluated: number
  fired: number
  delivered: number
  skipped_quiet: number
  skipped_cooldown: number
  errors: number
  ms: number
}

export async function runEvaluation(
  scope: 'standard' | 'business',
): Promise<CronSummary> {
  const startMs = Date.now()
  const summary: CronSummary = {
    rules_evaluated: 0,
    fired: 0,
    delivered: 0,
    skipped_quiet: 0,
    skipped_cooldown: 0,
    errors: 0,
    ms: 0,
  }

  // Tier mapping: standard cron handles Pro/Elite/Fraternity-flavor;
  // business cron handles standard Business only. Both filter to currently
  // active/trialing subs.
  const tierFilter = scope === 'business' ? ['business'] : ['pro', 'elite']
  const subtypeFilter = scope === 'business' ? ['standard'] : null // Fraternity gets standard cron too
  const sb = getServerClient()

  let rulesQuery = sb
    .from('alert_rules')
    .select(`
      id, user_id, name, description, trigger_type, trigger_config,
      market_filter, channels, cooldown_minutes, enabled, last_fired_at,
      created_at, updated_at,
      waitlist:user_id (
        id, email, plan_tier, subscription_status, business_subtype
      )
    `)
    .eq('enabled', true)

  const { data: rulesRaw, error: rulesErr } = await rulesQuery
  if (rulesErr) {
    summary.errors++
    summary.ms = Date.now() - startMs
    console.error(`[cron:${scope}] rules query failed`, rulesErr)
    return summary
  }

  // Tier + subtype filter happens in JS so the join can stay simple.
  type RawRow = AlertRule & {
    waitlist: {
      id: string
      email: string | null
      plan_tier: string
      subscription_status: string | null
      business_subtype: string | null
    } | null
  }
  const rules = ((rulesRaw ?? []) as unknown as RawRow[]).filter((r) => {
    const w = r.waitlist
    if (!w || !w.email) return false
    if (!tierFilter.includes(w.plan_tier)) return false
    if (w.plan_tier === 'business') {
      const subtype = w.business_subtype ?? 'standard'
      // Standard cron INCLUDES fraternity (5-min cadence per the brief).
      // Business cron is standard-only.
      if (scope === 'business' && subtype !== 'standard') return false
      if (scope === 'standard' && subtype !== 'fraternity') return false
    }
    if (w.subscription_status !== 'active' && w.subscription_status !== 'trialing') return false
    return true
  })

  if (rules.length === 0) {
    summary.ms = Date.now() - startMs
    console.log(`[cron:${scope}] rules=0 fired=0 delivered=0 ms=${summary.ms}`)
    return summary
  }

  const [{ snapshots }, history] = await Promise.all([
    loadAllLatestSnapshots(),
    loadMarketHistory(1),
  ])
  const historyByKey = new Map<string, MarketHistory>(history.map((h) => [h.key, h]))

  // Pull delivery prefs for the rule owners in one query.
  const userIds = Array.from(new Set(rules.map((r) => r.user_id)))
  const { data: prefsRows } = await sb
    .from('alert_delivery_prefs')
    .select('*')
    .in('user_id', userIds)
  const prefsByUser = new Map<string, NonNullable<typeof prefsRows>[number]>()
  for (const row of prefsRows ?? []) {
    prefsByUser.set(row.user_id as string, row)
  }

  for (const rule of rules) {
    summary.rules_evaluated++
    try {
      const matched = applyMarketFilter(snapshots, rule.market_filter ?? {})
      if (matched.length === 0) continue

      const result = runEvaluator(rule, matched, historyByKey)
      if (!result) continue
      summary.fired++

      // Cooldown check
      if (rule.last_fired_at) {
        const elapsedMs = Date.now() - new Date(rule.last_fired_at).getTime()
        if (elapsedMs < rule.cooldown_minutes * 60_000) {
          summary.skipped_cooldown++
          continue
        }
      }

      const w = rule.waitlist
      if (!w?.email) continue

      const userCtx: UserContext = {
        user_id: rule.user_id,
        email: w.email,
        prefs: defaultPrefs(prefsByUser.get(rule.user_id)),
      }

      const dispatch = await dispatchFire(rule, result, userCtx)
      const channelsSent = (Object.entries(dispatch) as Array<[string, { success: boolean }]>).filter(
        ([, v]) => v.success,
      ).map(([k]) => k)
      const anyQuiet = Object.values(dispatch).some((v) => v.reason === 'quiet_hours')
      if (channelsSent.length > 0) summary.delivered++
      if (anyQuiet && channelsSent.length === 0) summary.skipped_quiet++

      // Persist event + bump last_fired_at, only if we actually delivered or
      // tried to deliver (not on quiet-hours skip — let the rule fire next
      // cycle so the user doesn't lose the signal).
      if (channelsSent.length > 0 || !anyQuiet) {
        await sb.from('alert_events').insert({
          rule_id: rule.id,
          user_id: rule.user_id,
          fired_at: new Date().toISOString(),
          market_key: result.market_key,
          trigger_snapshot: result.trigger_snapshot,
          channels_sent: channelsSent,
          delivery_status: dispatch,
        })
        await sb
          .from('alert_rules')
          .update({ last_fired_at: new Date().toISOString() })
          .eq('id', rule.id)
      }
    } catch (err) {
      summary.errors++
      console.error(`[cron:${scope}] rule ${rule.id} failed`, err)
    }
  }

  summary.ms = Date.now() - startMs
  console.log(
    `[cron:${scope}] rules=${summary.rules_evaluated} fired=${summary.fired} delivered=${summary.delivered} skipped_quiet=${summary.skipped_quiet} skipped_cooldown=${summary.skipped_cooldown} errors=${summary.errors} ms=${summary.ms}`,
  )
  return summary
}

function runEvaluator(
  rule: AlertRule,
  matched: Awaited<ReturnType<typeof loadAllLatestSnapshots>>['snapshots'],
  historyByKey: Map<string, MarketHistory>,
): TriggerResult {
  const cfg = rule.trigger_config
  switch (rule.trigger_type) {
    case 'price_threshold':
      return evaluatePriceThreshold(cfg as Parameters<typeof evaluatePriceThreshold>[0], matched, historyByKey)
    case 'price_movement':
      return evaluatePriceMovement(cfg as Parameters<typeof evaluatePriceMovement>[0], matched, historyByKey)
    case 'overround_threshold':
      return evaluateOverround(cfg as Parameters<typeof evaluateOverround>[0], matched, historyByKey)
    case 'arb_appearance':
      return evaluateArbAppearance(cfg as Parameters<typeof evaluateArbAppearance>[0], matched)
  }
}

function defaultPrefs(
  row:
    | {
        email_enabled?: boolean
        email_digest_mode?: boolean
        push_enabled?: boolean
        quiet_hours_start?: number | null
        quiet_hours_end?: number | null
        quiet_hours_tz?: string | null
      }
    | undefined,
): UserContext['prefs'] {
  return {
    email_enabled: row?.email_enabled ?? true,
    email_digest_mode: row?.email_digest_mode ?? false,
    push_enabled: row?.push_enabled ?? true,
    quiet_hours_start: row?.quiet_hours_start ?? null,
    quiet_hours_end: row?.quiet_hours_end ?? null,
    quiet_hours_tz: row?.quiet_hours_tz ?? 'America/New_York',
  }
}
