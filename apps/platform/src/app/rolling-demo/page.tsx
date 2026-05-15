'use client'

import { useEffect, useState } from 'react'
import { RollingNumber } from '@/components/rolling-number'

// Standalone demo of <RollingNumber> — no auth required, doesn't depend
// on any DB / API call. Visit /rolling-demo to eyeball the animation
// in isolation. Numbers tick on a 3s loop with a small random walk so
// you see roll + flash without having to do anything.

const TICK_MS = 3000

function fmtCents(n: number): string {
  return `${n.toFixed(0)}¢`
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`
}
function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

function step(current: number, magnitude: number): number {
  // Random walk with bias toward staying in range. ~50/50 up/down.
  const sign = Math.random() < 0.5 ? -1 : 1
  return current + sign * Math.random() * magnitude
}

export default function RollingDemoPage() {
  const [yesAsk, setYesAsk] = useState(58)
  const [funding, setFunding] = useState(0.1044)
  const [pct24h, setPct24h] = useState(0.0083)
  const [markPx, setMarkPx] = useState(78695)
  const [oi, setOi] = useState(2_368_014_381)
  const [paused, setPaused] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setYesAsk((v) => Math.max(1, Math.min(99, Math.round(step(v, 4)))))
      setFunding((v) => step(v, 0.015))
      setPct24h((v) => step(v, 0.005))
      setMarkPx((v) => Math.max(100, step(v, 1500)))
      setOi((v) => Math.max(1e6, step(v, 50e6)))
      setTick((t) => t + 1)
    }, TICK_MS)
    return () => clearInterval(id)
  }, [paused])

  function tickNow() {
    setYesAsk((v) => Math.max(1, Math.min(99, Math.round(step(v, 4)))))
    setFunding((v) => step(v, 0.015))
    setPct24h((v) => step(v, 0.005))
    setMarkPx((v) => Math.max(100, step(v, 1500)))
    setOi((v) => Math.max(1e6, step(v, 50e6)))
    setTick((t) => t + 1)
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ROLLING NUMBER DEMO
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Per-digit roll · direction-tinted flash
          </h1>
          <p className="text-sm text-stone-600 max-w-xl leading-relaxed">
            Numbers tick every 3s with a small random walk. Watch each
            digit roll independently — only the columns that actually
            changed move. Brand emerald (#00703c) flashes on increase,
            red on decrease, opacity scaled by magnitude.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="text-xs px-3 py-1.5 rounded-full border border-stone-300 hover:bg-stone-100 font-bold tracking-wider"
            >
              {paused ? 'RESUME' : 'PAUSE'}
            </button>
            <button
              type="button"
              onClick={tickNow}
              className="text-xs px-3 py-1.5 rounded-full bg-[#00703c] text-white hover:bg-[#003520] font-bold tracking-wider"
            >
              TICK NOW
            </button>
            <span className="text-[10px] text-stone-500 font-mono">
              {tick} ticks
            </span>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DemoCard label="YES ASK (cents, integer)">
            <div className="text-4xl font-bold text-emerald-700">
              <RollingNumber
                value={yesAsk}
                format={fmtCents}
                flashScale={3}
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-2">
              Most common case — 1-2 digits, integer cents. Watch the
              ones place roll cleanly when it ticks 1-2 cents.
            </p>
          </DemoCard>

          <DemoCard label="FUNDING APR (%, 2 decimals)">
            <div className="text-4xl font-bold text-emerald-700">
              <RollingNumber
                value={funding}
                format={fmtPct}
                flashScale={0.05}
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-2">
              Multiple changing digits per tick. Decimal stays static;
              only the digits roll.
            </p>
          </DemoCard>

          <DemoCard label="24H % (small magnitudes)">
            <div className="text-3xl font-bold text-stone-900">
              <RollingNumber
                value={pct24h}
                format={fmtPct}
                flashScale={0.005}
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-2">
              Small flashScale → even tiny moves give a strong flash.
              Tune per-context.
            </p>
          </DemoCard>

          <DemoCard label="MARK PRICE ($, large)">
            <div className="text-3xl font-bold text-stone-900">
              <RollingNumber
                value={markPx}
                format={fmtUsd}
                flashScale={2000}
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-2">
              Compact $ formatter. Watch the decimals roll while the
              integer thousands stay put on small ticks.
            </p>
          </DemoCard>

          <DemoCard label="OPEN INTEREST ($B, very large)">
            <div className="text-3xl font-bold text-stone-900">
              <RollingNumber
                value={oi}
                format={fmtUsd}
                flashScale={100e6}
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-2">
              Large numbers with formatter that may change suffix
              (K/M/B). Roll handles digit shifts but suffix changes
              are static.
            </p>
          </DemoCard>

          <DemoCard label="STATIC SIDE-BY-SIDE (control)">
            <div className="text-3xl font-bold text-stone-900 font-mono tabular-nums">
              {fmtCents(yesAsk)}
            </div>
            <p className="text-[11px] text-stone-500 mt-2">
              Same value, no animation — to compare. Notice how the
              static one just snaps; the animated one carries direction
              even when you're not looking directly.
            </p>
          </DemoCard>
        </section>

        <footer className="border-t border-stone-200 pt-4 text-[11px] text-stone-500">
          Tokens: roll 250ms · cubic-bezier(0.16, 1, 0.3, 1) · flash 60+100+240ms ·
          peak opacity = 0.1 + min(1, |Δ|/flashScale) × 0.25 ·
          respects prefers-reduced-motion.
        </footer>
      </div>
    </main>
  )
}

function DemoCard({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="text-[10px] tracking-wider text-stone-500 mb-2 font-medium">
        {label}
      </div>
      {children}
    </article>
  )
}
