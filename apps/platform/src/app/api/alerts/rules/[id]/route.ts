import type { NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase-server'
import { getTierIdentity, TierError } from '@/lib/require-tier'
import {
  validateChannels,
  validateCooldown,
  validateMarketFilter,
  validateTriggerConfig,
} from '@/lib/alerts/validate'
import type { Channel, TriggerType } from '@/lib/alerts/types'

// PATCH  /api/alerts/rules/[id] — partial update
// DELETE /api/alerts/rules/[id]
//
// Auth-gated. Verifies the rule belongs to the authenticated user before
// any mutation — RLS would also block, but explicit ownership check
// surfaces a clean 404 instead of an opaque 0-rows-updated.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  let me
  try {
    me = await getTierIdentity()
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    throw err
  }
  if (!me.waitlistId) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const sb = getServerClient()
  const { data: existing } = await sb
    .from('alert_rules')
    .select('id, user_id, trigger_type')
    .eq('id', id)
    .maybeSingle()
  if (!existing || existing.user_id !== me.waitlistId) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const update: Record<string, unknown> = {}

  if (typeof body.name === 'string' && body.name.trim()) {
    update.name = body.name.trim().slice(0, 200)
  }
  if (typeof body.description === 'string') {
    update.description = body.description.trim().slice(0, 2000) || null
  }
  if (body.trigger_config !== undefined) {
    const t = (body.trigger_type as TriggerType | undefined) ?? (existing.trigger_type as TriggerType)
    const err = validateTriggerConfig(t, body.trigger_config)
    if (err) return Response.json({ error: 'invalid_input', ...err }, { status: 400 })
    update.trigger_config = body.trigger_config
  }
  if (body.market_filter !== undefined) {
    const err = validateMarketFilter(body.market_filter)
    if (err) return Response.json({ error: 'invalid_input', ...err }, { status: 400 })
    update.market_filter = body.market_filter
  }
  if (body.channels !== undefined) {
    const err = validateChannels(body.channels)
    if (err) return Response.json({ error: 'invalid_input', ...err }, { status: 400 })
    update.channels = body.channels as Channel[]
  }
  if (body.cooldown_minutes !== undefined) {
    const err = validateCooldown(body.cooldown_minutes)
    if (err) return Response.json({ error: 'invalid_input', ...err }, { status: 400 })
    update.cooldown_minutes = body.cooldown_minutes
  }
  if (typeof body.enabled === 'boolean') {
    update.enabled = body.enabled
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'no_changes' }, { status: 400 })
  }

  const { data: row, error } = await sb
    .from('alert_rules')
    .update(update)
    .eq('id', id)
    .eq('user_id', me.waitlistId)
    .select('*')
    .single()
  if (error) {
    return Response.json({ error: 'update_failed', message: error.message }, { status: 500 })
  }
  return Response.json({ rule: row })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  let me
  try {
    me = await getTierIdentity()
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    throw err
  }
  if (!me.waitlistId) return Response.json({ error: 'unauthenticated' }, { status: 401 })

  const sb = getServerClient()
  const { error } = await sb
    .from('alert_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', me.waitlistId)
  if (error) {
    return Response.json({ error: 'delete_failed', message: error.message }, { status: 500 })
  }
  return Response.json({ ok: true })
}
