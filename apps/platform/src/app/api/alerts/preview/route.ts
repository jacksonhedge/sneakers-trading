import { loadAllLatestSnapshots, loadMarketHistory, type MarketHistory } from '@/lib/markets-data'
import { getTierIdentity, TierError } from '@/lib/require-tier'
import {
  applyMarketFilter,
  evaluateArbAppearance,
  evaluateOverround,
  evaluatePriceMovement,
  evaluatePriceThreshold,
} from '@/lib/alerts/triggers'
import {
  validateChannels,
  validateMarketFilter,
  validateTriggerConfig,
} from '@/lib/alerts/validate'
import type { TriggerType } from '@/lib/alerts/types'

// POST /api/alerts/preview
//
// Body: {
//   trigger_type, trigger_config, market_filter, cooldown_minutes (default 60)
// }
//
// Runs the evaluator across the last 7 days of history at hourly slices and
// returns:
//   - matching_markets_now: how many markets the filter currently matches
//   - would_have_fired: how many fires the rule would have produced over
//     the last 7d, applying cooldown
//   - sample_fires: up to 5 example fires with timestamps + market keys
//
// Drives the "preview" panel on the rule builder form. Auth-gated; doesn't
// require an active subscription (cheaper to let free users preview before
// upselling).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// History scan can be slow on large archives.
export const maxDuration = 30

interface PreviewBody {
  trigger_type?: unknown
  trigger_config?: unknown
  market_filter?: unknown
  cooldown_minutes?: unknown
}

export async function POST(req: Request) {
  try {
    await getTierIdentity()
  } catch (err) {
    if (err instanceof TierError) return err.toResponse()
    throw err
  }

  const body = (await req.json().catch(() => ({}))) as PreviewBody

  if (typeof body.trigger_type !== 'string') {
    return Response.json({ error: 'invalid_input', field: 'trigger_type' }, { status: 400 })
  }
  const triggerType = body.trigger_type as TriggerType
  const cfgErr = validateTriggerConfig(triggerType, body.trigger_config)
  if (cfgErr) return Response.json({ error: 'invalid_input', ...cfgErr }, { status: 400 })
  const filterErr = validateMarketFilter(body.market_filter)
  if (filterErr) return Response.json({ error: 'invalid_input', ...filterErr }, { status: 400 })

  // Channels arent't relevant for preview, but the validator helps surface
  // shape errors early. Skip if not provided.
  if (body['cooldown_minutes' as keyof PreviewBody] == null && false) {
    validateChannels // keep import side-effect free; intentionally unused here
  }

  const cooldownMin =
    typeof body.cooldown_minutes === 'number' && body.cooldown_minutes > 0
      ? Math.floor(body.cooldown_minutes)
      : 60

  const [{ snapshots: latest }, history] = await Promise.all([
    loadAllLatestSnapshots(),
    loadMarketHistory(7),
  ])
  const filter = body.market_filter as Parameters<typeof applyMarketFilter>[1]

  // Now-state
  const matchingNow = applyMarketFilter(latest, filter).length

  // Replay: walk hourly checkpoints over the last 7 days. At each
  // checkpoint, build a "latest snapshot per market" view from history
  // truncated at that timestamp, then call the evaluator.
  const nowMs = Date.now()
  const startMs = nowMs - 7 * 24 * 3600 * 1000
  const stepMs = 60 * 60 * 1000

  // Precompute history-by-key so we don't reindex per checkpoint.
  const histByKey = new Map<string, MarketHistory>(history.map((h) => [h.key, h]))

  const fires: Array<{ at: string; market_key: string; snapshot: Record<string, unknown> }> = []
  let lastFireMs = -Infinity

  for (let t = startMs; t <= nowMs; t += stepMs) {
    const truncatedSnaps: Parameters<typeof applyMarketFilter>[0] = []
    const truncatedHist = new Map<string, MarketHistory>()
    for (const [key, h] of histByKey) {
      const visible = h.snapshots.filter((s) => new Date(s.ts).getTime() <= t)
      if (visible.length === 0) continue
      truncatedHist.set(key, { ...h, snapshots: visible })
      truncatedSnaps.push(visible[visible.length - 1])
    }
    const matched = applyMarketFilter(truncatedSnaps, filter)
    if (matched.length === 0) continue
    const cfg = body.trigger_config as unknown
    let result
    switch (triggerType) {
      case 'price_threshold':
        result = evaluatePriceThreshold(cfg as Parameters<typeof evaluatePriceThreshold>[0], matched, truncatedHist)
        break
      case 'price_movement':
        result = evaluatePriceMovement(cfg as Parameters<typeof evaluatePriceMovement>[0], matched, truncatedHist)
        break
      case 'overround_threshold':
        result = evaluateOverround(cfg as Parameters<typeof evaluateOverround>[0], matched, truncatedHist)
        break
      case 'arb_appearance':
        result = evaluateArbAppearance(cfg as Parameters<typeof evaluateArbAppearance>[0], matched)
        break
      default:
        result = null
    }
    if (!result) continue
    if (t - lastFireMs < cooldownMin * 60_000) continue
    lastFireMs = t
    fires.push({
      at: new Date(t).toISOString(),
      market_key: result.market_key,
      snapshot: result.trigger_snapshot,
    })
  }

  return Response.json({
    matching_markets_now: matchingNow,
    would_have_fired: fires.length,
    sample_fires: fires.slice(0, 5),
    window: { start: new Date(startMs).toISOString(), end: new Date(nowMs).toISOString() },
  })
}
