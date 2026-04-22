import webpush from 'web-push'
import { Resend } from 'resend'
import { getServerClient } from '../supabase-server'
import type { AlertRule, Channel, TriggerResult } from './types'

// Channel dispatch for the cron evaluator. Each channel has its own
// best-effort send + failure recording. Returns a per-channel
// {success: bool, reason?: string} map for persistence in
// alert_events.delivery_status.
//
// Quiet-hours and digest-mode interactions:
//   - Quiet hours apply to BOTH channels in v1 (skip with reason
//     'quiet_hours' rather than queuing — rule fires again next cycle).
//   - email_digest_mode is honored as a flag but v1 still sends one email
//     per fire (true batching deferred — see the brief's don't-do list).

let _vapidConfigured = false
function ensureVapid(): boolean {
  if (_vapidConfigured) return true
  const subject = process.env.VAPID_SUBJECT
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!subject || !pub || !priv) {
    console.warn('[dispatch] VAPID env vars not set — push channel will be skipped')
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  _vapidConfigured = true
  return true
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

export interface UserContext {
  user_id: string         // waitlist.id (uuid)
  email: string
  prefs: {
    email_enabled: boolean
    email_digest_mode: boolean
    push_enabled: boolean
    quiet_hours_start: number | null
    quiet_hours_end: number | null
    quiet_hours_tz: string
  }
}

export type ChannelOutcome = { success: boolean; reason?: string; error?: string }
export type DispatchResult = Partial<Record<Channel, ChannelOutcome>>

export async function dispatchFire(
  rule: AlertRule,
  result: TriggerResult,
  user: UserContext,
): Promise<DispatchResult> {
  if (!result) return {}
  const out: DispatchResult = {}
  const inQuiet = isInQuietHours(user.prefs)
  const url = buildLinkBackUrl(result.market_key)

  for (const channel of rule.channels) {
    if (channel === 'browser_push') {
      if (!user.prefs.push_enabled) {
        out.browser_push = { success: false, reason: 'channel_disabled' }
        continue
      }
      if (inQuiet) {
        out.browser_push = { success: false, reason: 'quiet_hours' }
        continue
      }
      out.browser_push = await sendPush(user.user_id, rule, result, url)
    } else if (channel === 'email') {
      if (!user.prefs.email_enabled) {
        out.email = { success: false, reason: 'channel_disabled' }
        continue
      }
      if (inQuiet) {
        out.email = { success: false, reason: 'quiet_hours' }
        continue
      }
      out.email = await sendEmail(user.email, rule, result, url)
    }
  }
  return out
}

// ─── push ──────────────────────────────────────────────────────────────────

async function sendPush(
  userId: string,
  rule: AlertRule,
  result: TriggerResult,
  url: string,
): Promise<ChannelOutcome> {
  if (!ensureVapid()) return { success: false, reason: 'vapid_not_configured' }
  if (!result) return { success: false, reason: 'empty_result' }

  const sb = getServerClient()
  const { data: subs, error } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', userId)
  if (error) {
    return { success: false, reason: 'subscription_lookup_failed', error: error.message }
  }
  if (!subs || subs.length === 0) {
    return { success: false, reason: 'no_subscriptions' }
  }

  // Truncate to keep under the 4KB Web Push payload limit.
  const title = `🔔 ${rule.name}`.slice(0, 80)
  const body = formatBody(rule, result).slice(0, 240)
  const payload = JSON.stringify({
    title,
    body,
    url,
    ruleId: rule.id,
    tag: `rule:${rule.id}`,
  })

  let okCount = 0
  let failCount = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint as string,
          keys: { p256dh: sub.p256dh_key as string, auth: sub.auth_key as string },
        },
        payload,
      )
      okCount++
      await sb
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', sub.id)
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        // Subscription gone — prune.
        await sb.from('push_subscriptions').delete().eq('id', sub.id)
      }
      failCount++
    }
  }

  if (okCount === 0) {
    return { success: false, reason: 'all_endpoints_failed', error: `${failCount} failures` }
  }
  return { success: true, reason: failCount > 0 ? `${okCount}_ok_${failCount}_pruned` : undefined }
}

// ─── email ─────────────────────────────────────────────────────────────────

async function sendEmail(
  email: string,
  rule: AlertRule,
  result: TriggerResult,
  url: string,
): Promise<ChannelOutcome> {
  if (!result) return { success: false, reason: 'empty_result' }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { success: false, reason: 'resend_not_configured' }
  }
  const from = process.env.WAITLIST_FROM_EMAIL ?? 'Sneakers Terminal <alerts@resend.dev>'

  const subject = `🔔 ${rule.name} just fired`
  const bodyText = [
    `> ${rule.name}`,
    rule.description ? '' : null,
    rule.description ?? null,
    '',
    formatBody(rule, result),
    '',
    `View market: ${SITE_URL}${url}`,
    '',
    '— Sneakers Terminal',
  ]
    .filter((l): l is string => l !== null)
    .join('\n')

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject,
      text: bodyText,
    })
    if (error) {
      return { success: false, reason: 'resend_error', error: error.message }
    }
    return { success: true }
  } catch (err) {
    return {
      success: false,
      reason: 'resend_exception',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

function buildLinkBackUrl(marketKey: string): string {
  // For arb fires the market_key is "arb:..." — link to the arbitrage panel.
  if (marketKey.startsWith('arb:')) return '/dashboard?panel=arbitrage'
  return `/dashboard?m=${encodeURIComponent(marketKey)}`
}

function formatBody(rule: AlertRule, result: TriggerResult): string {
  if (!result) return rule.description ?? rule.name
  const s = result.trigger_snapshot as Record<string, unknown>
  const kind = s.kind as string | undefined
  const question = (s.question as string | undefined) ?? marketSummary(result.market_key)
  switch (kind) {
    case 'price_threshold': {
      const cur = pct(s.current_prob)
      const dir = s.direction === 'above' ? '↑' : '↓'
      return `${question} — ${dir} ${cur} (crossed ${pct(s.threshold)})`
    }
    case 'price_movement': {
      const delta = pct(s.delta)
      const cur = pct(s.current_prob)
      const earlier = pct(s.earliest_prob)
      return `${question} — ${earlier} → ${cur} (${delta} move)`
    }
    case 'overround_threshold': {
      const cur = (s.current_overround as number)?.toFixed(3) ?? '?'
      return `${question} — overround ${cur} (crossed ${(s.threshold as number)?.toFixed(3) ?? '?'})`
    }
    case 'arb_appearance': {
      const edge = (s.edge_pp as number)?.toFixed(2) ?? '?'
      return `Cross-book arb: ${s.away} @ ${s.home} (${s.sport}) — ${edge}pp edge across ${(s.books as string[])?.join('/')}`
    }
  }
  return question
}

function pct(v: unknown): string {
  if (typeof v !== 'number') return '?'
  return `${(v * 100).toFixed(1)}%`
}

function marketSummary(key: string): string {
  return key
}

/**
 * Quiet-hours check. Returns true if "now" in the user's tz falls inside
 * [quiet_hours_start, quiet_hours_end). Handles wrap (e.g. 22 → 8 means
 * 10pm–8am). Returns false if quiet hours are not configured.
 */
function isInQuietHours(prefs: UserContext['prefs']): boolean {
  if (prefs.quiet_hours_start == null || prefs.quiet_hours_end == null) return false
  // Use Intl.DateTimeFormat to resolve the user's local hour for their tz.
  let hour: number
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: prefs.quiet_hours_tz,
    })
    const parts = fmt.formatToParts(new Date())
    const h = parts.find((p) => p.type === 'hour')?.value ?? '0'
    hour = parseInt(h, 10) % 24
  } catch {
    return false
  }
  const start = prefs.quiet_hours_start
  const end = prefs.quiet_hours_end
  if (start === end) return false
  if (start < end) {
    return hour >= start && hour < end
  }
  // wraps midnight, e.g. 22..8
  return hour >= start || hour < end
}
