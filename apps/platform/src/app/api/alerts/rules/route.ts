import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { getTierIdentity, TierError } from '@/lib/require-tier'
import {
  ruleCapFor,
  validateChannels,
  validateCooldown,
  validateMarketFilter,
  validateTriggerConfig,
} from '@/lib/alerts/validate'
import type { TriggerType, Channel } from '@/lib/alerts/types'

// GET  /api/alerts/rules — list this user's rules.
// POST /api/alerts/rules — create a new rule.
//
// Tier-cap enforcement is server-side here. Free tier: 0 rules (402).
// Per-tier counts come from lib/alerts/validate.ts ruleCapFor() so the cap
// for Fraternity (20) differs from standard Business (unlimited).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_TRIGGER_TYPES: ReadonlySet<TriggerType> = new Set([
  'price_threshold',
  'price_movement',
  'overround_threshold',
  'arb_appearance',
])

interface CreateBody {
  name?: unknown
  description?: unknown
  trigger_type?: unknown
  trigger_config?: unknown
  market_filter?: unknown
  channels?: unknown
  cooldown_minutes?: unknown
  enabled?: unknown
}

export async function GET() {
  let me
  try {
    me = await getTierIdentity()
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    throw err
  }
  if (!me.waitlistId) return Response.json({ rules: [] })

  const sb = getServerClient()
  const { data, error } = await sb
    .from('alert_rules')
    .select('*')
    .eq('user_id', me.waitlistId)
    .order('created_at', { ascending: false })
  if (error) {
    return Response.json({ error: 'lookup_failed', message: error.message }, { status: 500 })
  }
  const cap = ruleCapFor(me.tier, me.businessSubtype)
  return Response.json({
    rules: data ?? [],
    cap: Number.isFinite(cap) ? cap : null,
    used: (data ?? []).length,
  })
}

export async function POST(req: Request) {
  let me
  try {
    me = await getTierIdentity()
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    throw err
  }
  if (!me.waitlistId || !me.isActive || me.tier === 'free') {
    return Response.json(
      { error: 'upgrade_required', message: 'Alerts require an active Pro or higher subscription.' },
      { status: 402 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as CreateBody

  // Tier-count cap.
  const cap = ruleCapFor(me.tier, me.businessSubtype)
  if (Number.isFinite(cap)) {
    const sb = getServerClient()
    const { count } = await sb
      .from('alert_rules')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', me.waitlistId)
    if (typeof count === 'number' && count >= cap) {
      const upsell =
        me.tier === 'pro'
          ? 'Upgrade to Elite for 20 rules.'
          : me.tier === 'elite'
            ? 'Upgrade to Business for unlimited rules.'
            : 'Increase the cap in your account settings.'
      return Response.json(
        { error: 'rule_cap_exceeded', cap, used: count, message: upsell },
        { status: 402 },
      )
    }
  }

  const validation = validateCreateBody(body)
  if (validation.error) {
    return Response.json(
      { error: 'invalid_input', field: validation.error.field, message: validation.error.message },
      { status: 400 },
    )
  }
  const v = validation.value

  // Tier-channel gating: Free has no rules anyway. SMS/webhook channels
  // are not in v1 — validateChannels rejects them. So no extra check here.

  const sb = getServerClient()
  const { data: row, error } = await sb
    .from('alert_rules')
    .insert({
      user_id: me.waitlistId,
      name: v.name,
      description: v.description,
      trigger_type: v.trigger_type,
      trigger_config: v.trigger_config,
      market_filter: v.market_filter,
      channels: v.channels,
      cooldown_minutes: v.cooldown_minutes,
      enabled: v.enabled,
    })
    .select('*')
    .single()
  if (error) {
    return Response.json({ error: 'insert_failed', message: error.message }, { status: 500 })
  }
  return Response.json({ rule: row }, { status: 201 })
}

interface ValidatedCreate {
  name: string
  description: string | null
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  market_filter: Record<string, unknown>
  channels: Channel[]
  cooldown_minutes: number
  enabled: boolean
}

function validateCreateBody(
  b: CreateBody,
): { value: ValidatedCreate; error: null } | { value: null; error: { field: string; message: string } } {
  if (typeof b.name !== 'string' || !b.name.trim()) {
    return { value: null, error: { field: 'name', message: 'required' } }
  }
  if (typeof b.trigger_type !== 'string' || !ALLOWED_TRIGGER_TYPES.has(b.trigger_type as TriggerType)) {
    return { value: null, error: { field: 'trigger_type', message: 'invalid' } }
  }
  const cfgErr = validateTriggerConfig(b.trigger_type as TriggerType, b.trigger_config)
  if (cfgErr) return { value: null, error: cfgErr }
  const filterErr = validateMarketFilter(b.market_filter)
  if (filterErr) return { value: null, error: filterErr }
  const channelsErr = validateChannels(b.channels)
  if (channelsErr) return { value: null, error: channelsErr }
  const cooldownErr = validateCooldown(b.cooldown_minutes ?? 60)
  if (cooldownErr) return { value: null, error: cooldownErr }

  return {
    value: {
      name: b.name.trim().slice(0, 200),
      description:
        typeof b.description === 'string' && b.description.trim()
          ? b.description.trim().slice(0, 2000)
          : null,
      trigger_type: b.trigger_type as TriggerType,
      trigger_config: b.trigger_config as Record<string, unknown>,
      market_filter: b.market_filter as Record<string, unknown>,
      channels: b.channels as Channel[],
      cooldown_minutes: typeof b.cooldown_minutes === 'number' ? b.cooldown_minutes : 60,
      enabled: b.enabled !== false, // default true
    },
    error: null,
  }
}
