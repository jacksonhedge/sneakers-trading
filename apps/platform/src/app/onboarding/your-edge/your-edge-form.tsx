'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  RISK_BANDS,
  STRATEGY_STYLES,
  edgePreview,
  type RiskBandId,
  type StrategyStyleId,
} from '@/lib/onboarding-edge'

export function YourEdgeForm({
  initialRisk,
  initialStyle,
}: {
  initialRisk: RiskBandId | null
  initialStyle: StrategyStyleId | null
}) {
  const router = useRouter()
  const [risk, setRisk] = useState<RiskBandId | ''>(initialRisk ?? '')
  const [style, setStyle] = useState<StrategyStyleId | ''>(initialStyle ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!risk || !style) {
      setError('Pick a risk band and a strategy style.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await fetch('/api/onboarding/edge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ risk_band: risk, strategy_style: style }),
    })
    if (!res.ok) {
      setBusy(false)
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(
        body.error === 'unauthenticated'
          ? 'Your session expired — sign in again.'
          : 'Could not tune O’Toole. Try again.',
      )
      return
    }
    router.push('/onboarding/about-you')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <div className="block text-[11px] tracking-wider text-emerald-300/80 mb-2">
          RISK BAND
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {RISK_BANDS.map((opt) => {
            const active = risk === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRisk(opt.id)}
                className={`text-left p-3 rounded border transition ${
                  active
                    ? 'border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/40'
                    : 'border-white/20 bg-black/40 hover:border-white/40 hover:bg-black/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`text-sm font-semibold ${active ? 'text-emerald-300' : 'text-white'}`}
                  >
                    {opt.label}
                  </div>
                  <div className="text-[10px] tabular-nums text-white/45">{opt.range}</div>
                </div>
                <div className="text-[11px] text-white/55 mt-0.5 leading-snug">{opt.sub}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="block text-[11px] tracking-wider text-emerald-300/80 mb-2">
          STRATEGY STYLE
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STRATEGY_STYLES.map((opt) => {
            const active = style === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStyle(opt.id)}
                className={`text-left p-3 rounded border transition ${
                  active
                    ? 'border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/40'
                    : 'border-white/20 bg-black/40 hover:border-white/40 hover:bg-black/60'
                }`}
              >
                <div
                  className={`text-sm font-semibold ${active ? 'text-emerald-300' : 'text-white'}`}
                >
                  {opt.label}
                </div>
                <div className="text-[11px] text-white/55 mt-0.5 leading-snug">{opt.sub}</div>
              </button>
            )
          })}
        </div>
      </div>

      {risk && style && (
        <div className="rounded border border-emerald-400/30 bg-emerald-500/[0.07] px-4 py-3">
          <div className="text-[10px] tracking-[0.2em] text-emerald-300/80 font-semibold mb-1">
            O&apos;TOOLE IS NOW TUNED
          </div>
          <div className="text-sm text-white/85 leading-snug">{edgePreview(risk, style)}</div>
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={busy || !risk || !style}
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50 tracking-wider"
        >
          {busy ? 'TUNING…' : 'CONTINUE →'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
          {'>'} {error}
        </div>
      )}
    </form>
  )
}
