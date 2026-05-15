'use client'

import { useCallback, useEffect, useState } from 'react'
import { PlatformLogo } from './platform-logo'

// Renders pending trade_drafts as confirm/cancel cards above the OToole
// chat stream. Polls the pending-drafts endpoint every 20s + immediately
// after the parent triggers `onShouldRefresh` (e.g. after a chat message
// that called propose_trade). Confirm hits /api/otoole/execute-trade,
// cancel hits /api/otoole/cancel-draft. The 5-gate verdicts come back
// in the execute response and we surface them inline if a confirm fails.

interface Draft {
  id: string
  platform: string
  platform_market_id: string
  outcome_name: string
  side: 'buy' | 'sell'
  size_usd: number
  max_price: number
  rationale: string | null
  ttl_minutes: number
  take_profit_price: number | string | null
  stop_loss_price: number | string | null
  metadata: { market_question?: string; market_yes_ask?: number | null } | null
  created_at: string
}

function fmtCents(v: number | string | null): string | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  if (!Number.isFinite(n)) return null
  return `${Math.round(n * 100)}¢`
}

type GateVerdict =
  | { gate: string; pass: true; detail?: string }
  | { gate: string; pass: false; reason: string }

interface CardState {
  busy: boolean
  error: string | null
  verdicts: GateVerdict[] | null
}

export interface TradeDraftCardsHandle {
  refresh: () => void
}

export function TradeDraftCards({
  pollMs = 20_000,
  refreshNonce = 0,
}: {
  pollMs?: number
  /** Bump this value to force an immediate refetch (e.g. after a chat
   *  exchange that may have produced a propose_trade tool call). */
  refreshNonce?: number
}) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loaded, setLoaded] = useState(false)
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({})

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/otoole/pending-drafts', { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { drafts?: Draft[] }
      setDrafts(data.drafts ?? [])
    } catch {
      // Network blip — keep whatever we had.
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, pollMs)
    return () => clearInterval(id)
  }, [refresh, pollMs])

  useEffect(() => {
    if (refreshNonce > 0) refresh()
  }, [refreshNonce, refresh])

  async function confirmDraft(draftId: string) {
    setCardStates((s) => ({
      ...s,
      [draftId]: { busy: true, error: null, verdicts: null },
    }))
    try {
      const res = await fetch('/api/otoole/execute-trade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        reason?: string
        verdicts?: GateVerdict[]
        orderId?: string
      }
      if (data.ok) {
        // Successful trade — drop the card immediately + force a refresh
        // so any second draft of the same market also flips.
        setCardStates((s) => {
          const next = { ...s }
          delete next[draftId]
          return next
        })
        await refresh()
      } else {
        setCardStates((s) => ({
          ...s,
          [draftId]: {
            busy: false,
            error: data.reason ?? 'Execution failed.',
            verdicts: data.verdicts ?? null,
          },
        }))
      }
    } catch (err) {
      setCardStates((s) => ({
        ...s,
        [draftId]: {
          busy: false,
          error: (err as Error).message,
          verdicts: null,
        },
      }))
    }
  }

  async function cancelDraft(draftId: string) {
    setCardStates((s) => ({
      ...s,
      [draftId]: { busy: true, error: null, verdicts: null },
    }))
    await fetch('/api/otoole/cancel-draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId }),
    }).catch(() => {})
    await refresh()
  }

  if (!loaded) return null
  if (drafts.length === 0) return null

  return (
    <div className="space-y-2.5 mb-4">
      {drafts.map((d) => {
        const state = cardStates[d.id]
        const yesAsk = d.metadata?.market_yes_ask ?? null
        const question =
          d.metadata?.market_question ?? `${d.platform}:${d.platform_market_id}`
        const expiresMs =
          new Date(d.created_at).getTime() + d.ttl_minutes * 60_000 - Date.now()
        const expiresMin = Math.max(0, Math.round(expiresMs / 60_000))
        return (
          <div
            key={d.id}
            className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3 space-y-2.5"
          >
            <div className="flex items-start gap-2.5">
              <PlatformLogo platform={d.platform} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] tracking-wider font-semibold text-emerald-800">
                    O&apos;TOOLE PROPOSED
                  </span>
                  <span className="text-[10px] text-stone-500">
                    expires in {expiresMin}m
                  </span>
                </div>
                <div
                  className="text-[13px] font-semibold text-stone-900 leading-snug"
                  title={question}
                >
                  {question}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="bg-white/80 rounded px-2 py-1.5">
                <div className="text-[9px] text-stone-500 tracking-wider">SIDE</div>
                <div
                  className={
                    d.side === 'buy'
                      ? 'text-emerald-700 font-semibold'
                      : 'text-red-700 font-semibold'
                  }
                >
                  {d.side.toUpperCase()} {d.outcome_name}
                </div>
              </div>
              <div className="bg-white/80 rounded px-2 py-1.5">
                <div className="text-[9px] text-stone-500 tracking-wider">SIZE</div>
                <div className="text-stone-900 font-semibold">
                  ${Number(d.size_usd).toFixed(0)}
                </div>
              </div>
              <div className="bg-white/80 rounded px-2 py-1.5">
                <div className="text-[9px] text-stone-500 tracking-wider">LIMIT</div>
                <div className="text-stone-900 font-semibold">
                  {Number(d.max_price).toFixed(2)}
                  {yesAsk != null && (
                    <span className="text-stone-500 font-normal ml-1">
                      ({yesAsk.toFixed(2)} now)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {(d.take_profit_price != null || d.stop_loss_price != null) && (
              <div className="rounded bg-white/80 px-2.5 py-1.5 flex items-center gap-3 text-[11px]">
                <span className="text-[9px] tracking-wider font-bold text-emerald-800 shrink-0">
                  AUTO-SELL
                </span>
                {fmtCents(d.take_profit_price) && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <span className="text-emerald-700">▲</span>
                    <span className="text-stone-500 text-[10px]">TP</span>
                    <span className="font-semibold text-stone-900">
                      {fmtCents(d.take_profit_price)}
                    </span>
                  </span>
                )}
                {fmtCents(d.stop_loss_price) && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <span className="text-red-700">▼</span>
                    <span className="text-stone-500 text-[10px]">SL</span>
                    <span className="font-semibold text-stone-900">
                      {fmtCents(d.stop_loss_price)}
                    </span>
                  </span>
                )}
              </div>
            )}

            {d.rationale && (
              <div className="text-[11px] text-stone-700 leading-relaxed bg-white/60 rounded px-2.5 py-1.5">
                {d.rationale}
              </div>
            )}

            {state?.error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-[11px] text-red-800 space-y-1">
                <div className="font-semibold">Blocked: {state.error}</div>
                {state.verdicts && state.verdicts.length > 0 && (
                  <ul className="space-y-0.5">
                    {state.verdicts.map((v) => (
                      <li
                        key={v.gate}
                        className={v.pass ? 'text-emerald-700' : 'text-red-700'}
                      >
                        {v.pass ? '✓' : '✗'} {v.gate}
                        {v.pass && v.detail ? ` — ${v.detail}` : ''}
                        {!v.pass ? ` — ${v.reason}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => confirmDraft(d.id)}
                disabled={state?.busy}
                className="flex-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-3 py-2 text-xs disabled:opacity-50 transition"
              >
                {state?.busy ? 'PLACING…' : 'CONFIRM →'}
              </button>
              <button
                type="button"
                onClick={() => cancelDraft(d.id)}
                disabled={state?.busy}
                className="rounded-full ring-1 ring-stone-300 hover:bg-stone-100 text-stone-700 font-semibold px-3 py-2 text-xs disabled:opacity-50 transition"
              >
                CANCEL
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
