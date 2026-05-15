'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { RobinhoodChart, RobinhoodSparkline } from '@/components/robinhood-chart'
import { RobinhoodChartV2, type ChartPoint } from '@/components/robinhood-chart-v2'

// Side-by-side comparison of the original RobinhoodChart and the V2
// polish pass + volume bars. No auth required — visit /chart-demo.
//
// Every scenario starts from a deterministic seeded shape and then
// extends live, appending a new point every ~1.5s (configurable).
// One global PAUSE button stops all tickers at once. Each point also
// carries a volume value so V2's bottom volume band has data to show.

function seedRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function makeWalk({
  n,
  start,
  vol,
  drift,
  minutesPerStep,
  seed,
  clamp = [0.01, 0.99] as [number, number],
  volumeBase = 50_000,
  volumeJitter = 80_000,
}: {
  n: number
  start: number
  vol: number
  drift: number
  minutesPerStep: number
  seed: number
  clamp?: [number, number]
  volumeBase?: number
  volumeJitter?: number
}): ChartPoint[] {
  const rand = seedRandom(seed)
  const out: ChartPoint[] = []
  let v = start
  const now = Date.now()
  for (let i = 0; i < n; i++) {
    v += drift + (rand() - 0.5) * 2 * vol
    if (v < clamp[0]) v = clamp[0]
    if (v > clamp[1]) v = clamp[1]
    const ts = now - (n - 1 - i) * minutesPerStep * 60_000
    const volume = volumeBase + rand() * volumeJitter
    out.push({ ts, value: v, volume })
  }
  return out
}

interface LiveOpts {
  paused: boolean
  intervalMs?: number
  vol: number
  clamp?: [number, number]
  volumeRange?: [number, number]
  cap?: number
}

function useLiveSeries(initial: ChartPoint[], opts: LiveOpts): ChartPoint[] {
  const [series, setSeries] = useState<ChartPoint[]>(initial)
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (opts.paused) return
    const id = setInterval(() => {
      const o = optsRef.current
      setSeries((prev) => {
        const last = prev[prev.length - 1]
        const clamp = o.clamp ?? [0.01, 0.99]
        let next = last.value + (Math.random() - 0.5) * 2 * o.vol
        if (next < clamp[0]) next = clamp[0]
        if (next > clamp[1]) next = clamp[1]
        const vr = o.volumeRange ?? [50_000, 200_000]
        const nextVol = vr[0] + Math.random() * (vr[1] - vr[0])
        const cap = o.cap ?? 120
        const point: ChartPoint = { ts: Date.now(), value: next, volume: nextVol }
        const grown = [...prev, point]
        return grown.length > cap ? grown.slice(grown.length - cap) : grown
      })
    }, opts.intervalMs ?? 1500)
    return () => clearInterval(id)
  }, [opts.paused, opts.intervalMs])

  return series
}

export default function ChartDemoPage() {
  const [paused, setPaused] = useState(false)
  const [tickInterval, setTickInterval] = useState<1500 | 750 | 3000>(1500)

  const tightSeed = useMemo(
    () => makeWalk({ n: 80, start: 0.42, vol: 0.012, drift: 0.0008, minutesPerStep: 15, seed: 42, volumeBase: 30_000, volumeJitter: 60_000 }),
    [],
  )
  const bigSeed = useMemo(
    () => makeWalk({ n: 100, start: 0.18, vol: 0.025, drift: 0.005, minutesPerStep: 10, seed: 7, volumeBase: 80_000, volumeJitter: 240_000 }),
    [],
  )
  const downSeed = useMemo(
    () => makeWalk({ n: 60, start: 0.78, vol: 0.018, drift: -0.004, minutesPerStep: 30, seed: 13, volumeBase: 40_000, volumeJitter: 120_000 }),
    [],
  )
  const chopSeed = useMemo(
    () => makeWalk({ n: 200, start: 0.5, vol: 0.04, drift: 0.0001, minutesPerStep: 3, seed: 99, volumeBase: 15_000, volumeJitter: 60_000 }),
    [],
  )

  const tightLive = useLiveSeries(tightSeed, { paused, intervalMs: tickInterval, vol: 0.008, clamp: [0.3, 0.55], volumeRange: [20_000, 80_000] })
  const bigLive = useLiveSeries(bigSeed, { paused, intervalMs: tickInterval, vol: 0.018, clamp: [0.05, 0.85], volumeRange: [80_000, 320_000] })
  const downLive = useLiveSeries(downSeed, { paused, intervalMs: tickInterval, vol: 0.014, clamp: [0.3, 0.85], volumeRange: [40_000, 160_000] })
  const chopLive = useLiveSeries(chopSeed, { paused, intervalMs: tickInterval, vol: 0.032, clamp: [0.2, 0.8], volumeRange: [10_000, 80_000] })

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-12">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            CHART V2 PROTOTYPE
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Robinhood-style charts — V2 polish</h1>
          <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
            Side-by-side comparison of the existing chart and the V2 polish
            pass: pulsing endpoint dot, end-of-line glow, auto-scaled Y
            domain, tighter gradient, magnetic crosshair, brand-emerald
            up-color, and a bottom volume band when data carries volume.
            Every scenario ticks live — new point every {tickInterval}ms —
            so the line visibly extends and the heartbeat keeps pulsing.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className={`text-xs px-3 py-1.5 rounded-full font-bold tracking-wider transition ${
                paused
                  ? 'bg-[#00703c] text-white hover:bg-[#003520]'
                  : 'border border-stone-300 hover:bg-stone-100'
              }`}
            >
              {paused ? 'RESUME' : 'PAUSE'}
            </button>
            <div className="inline-flex items-center gap-0.5 rounded-md ring-1 ring-stone-200 bg-stone-50 p-0.5">
              {([3000, 1500, 750] as const).map((ms) => (
                <button
                  key={ms}
                  type="button"
                  onClick={() => setTickInterval(ms)}
                  className={`text-[10px] tracking-wider font-bold px-2 py-0.5 rounded transition ${
                    tickInterval === ms
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {ms === 3000 ? 'CALM' : ms === 1500 ? 'NORMAL' : 'FAST'}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-stone-500 font-mono">
              {paused ? 'paused' : `tick every ${tickInterval}ms`}
            </span>
          </div>
        </header>

        <section className="space-y-3">
          <SectionHeader
            title="Scenario A · Tight range (was 42–47¢, now drifting)"
            note="Auto-scale wins big — fixed [0,1] makes a tight market look flat. V2 fills the canvas with the actual price action."
          />
          <Compare>
            <Pane label="Original (fixed [0,1] domain, no volume)">
              <RobinhoodChart points={tightLive} height={260} />
            </Pane>
            <Pane label="V2 (auto-scale + heartbeat + volume)">
              <RobinhoodChartV2 points={tightLive} height={260} />
            </Pane>
          </Compare>
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Scenario B · Big move 18¢ → 65¢-ish, still climbing"
            note="V2's endpoint glow + brand emerald should pop. Volume bars show liquidity per period."
          />
          <Compare>
            <Pane label="Original">
              <RobinhoodChart points={bigLive} height={260} />
            </Pane>
            <Pane label="V2 + volume">
              <RobinhoodChartV2 points={bigLive} height={260} />
            </Pane>
          </Compare>
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Scenario C · Downtrend"
            note="Red color path. Volume bars also tint red on downtrend — same direction signal as the line."
          />
          <Compare>
            <Pane label="Original">
              <RobinhoodChart points={downLive} height={260} />
            </Pane>
            <Pane label="V2 + volume">
              <RobinhoodChartV2 points={downLive} height={260} />
            </Pane>
          </Compare>
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Scenario D · Choppy sideways (200+ points, dense bars)"
            note="Hover anywhere — crosshair snaps to the nearest data point AND highlights the matching volume bar."
          />
          <Compare>
            <Pane label="Original">
              <RobinhoodChart points={chopLive} height={300} />
            </Pane>
            <Pane label="V2 + volume">
              <RobinhoodChartV2 points={chopLive} height={300} />
            </Pane>
          </Compare>
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Scenario E · V2 hero treatment, full width"
            note="What this would look like as the headline chart on a market detail page."
          />
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <RobinhoodChartV2 points={bigLive} height={360} />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Scenario F · Sparkline row (current usage, volume hidden)"
            note="The existing list-row sparkline. No interaction, no volume — already on-brand at this size."
          />
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <table className="w-full text-sm">
              <thead className="text-[10px] tracking-wider text-stone-500">
                <tr>
                  <th className="text-left py-2">MARKET</th>
                  <th className="text-left py-2">TREND</th>
                  <th className="text-right py-2">YES</th>
                </tr>
              </thead>
              <tbody>
                <SparkRow label="BTC > $80k by Friday" points={tightLive} />
                <SparkRow label="Trump wins NH primary" points={bigLive} />
                <SparkRow label="Fed cuts in May" points={downLive} />
                <SparkRow label="Lakers win Tuesday" points={chopLive} />
              </tbody>
            </table>
          </div>
        </section>

        <footer className="border-t border-stone-200 pt-4 text-[11px] text-stone-500 max-w-3xl">
          V2 polish: <span className="font-semibold">brand emerald #00703c up-color</span> ·
          autoscaled Y with 12% padding · pulsing endpoint dot (1.5s halo +
          1.5s dot) · end-of-line radial glow · tighter gradient ramp
          (28→10→2→0%) · magnetic crosshair · optional touch haptic ·
          volume band (top 73% price / 4% gap / 23% volume bars).
        </footer>
      </div>
    </main>
  )
}

function SectionHeader({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <p className="text-xs text-stone-500 mt-0.5">{note}</p>
    </div>
  )
}

function Compare({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>
}

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] tracking-wider text-stone-500 mb-2 font-medium">{label}</div>
      {children}
    </div>
  )
}

function SparkRow({ label, points }: { label: string; points: ChartPoint[] }) {
  const last = points[points.length - 1]?.value ?? 0
  return (
    <tr className="border-t border-stone-100">
      <td className="py-2 pr-3 text-stone-900 font-medium truncate max-w-xs">{label}</td>
      <td className="py-2 pr-3 w-32">
        <RobinhoodSparkline points={points} height={28} />
      </td>
      <td className="py-2 text-right font-mono tabular-nums text-stone-900 font-semibold">
        {(last * 100).toFixed(0)}¢
      </td>
    </tr>
  )
}
