'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// Robinhood-style price chart.
//
// Visual language:
//   - Single bold line, direction-aware color (emerald up, red down vs first point)
//   - Soft gradient fill underneath, fading to transparent
//   - No grid / no axes — just the line + an optional dashed start-price reference
//   - Catmull-Rom smoothing on the primary line for a clean curve (toggleable)
//   - 600ms draw-in animation on mount (pathLength=1 + stroke-dashoffset)
//   - Hover/touch crosshair + filled circle + popover with value+timestamp+delta
//
// Filtering:
//   - In-chart timeframe pills (1H / 4H / 1D / 1W / ALL) filter CLIENT-SIDE.
//     They zoom into whatever data was loaded by the server — no roundtrip.
//
// Two exports:
//   <RobinhoodChart>     — interactive, full UX, market detail pages
//   <RobinhoodSparkline> — non-interactive, no smoothing, for cards / lists

export type ChartPoint = {
  ts: string | number
  value: number
}

export type SecondaryLine = {
  label: string
  points: ChartPoint[]
  color?: string
}

type RangeId = '1H' | '4H' | '1D' | '1W' | 'ALL'

interface ChartProps {
  points: ChartPoint[]
  secondary?: SecondaryLine[]
  /** Y-axis range. Defaults to [0, 1] (probability). */
  domain?: [number, number]
  /** Format value for popover. Default: cents (e.g. 0.65 -> "65¢"). */
  formatValue?: (v: number) => string
  /** Format ts for popover. Default: localized short. */
  formatTs?: (ts: number) => string
  /** Show the dashed start-price reference line. Default true. */
  showReferenceLine?: boolean
  /** Catmull-Rom smoothing on the primary line. Default true. */
  smooth?: boolean
  /** Override directional color logic. */
  upColor?: string
  downColor?: string
  /** Height in CSS px. Default 320. */
  height?: number
  /** Initial timeframe pill — 'ALL' shows everything passed in. */
  initialRange?: RangeId
  /** Hide the timeframe pill strip. Useful when an external control
   *  (e.g. server-side TimeframeTabs) already manages range. */
  hideRangePicker?: boolean
  /** ARIA label. */
  ariaLabel?: string
}

const DEFAULT_UP = '#10b981'   // emerald-500
const DEFAULT_DOWN = '#ef4444' // red-500
const SECONDARY_DEFAULT = 'rgba(120, 113, 108, 0.55)'

const RANGES: ReadonlyArray<{ id: RangeId; label: string; minutes: number | null }> = [
  { id: '1H', label: '1H', minutes: 60 },
  { id: '4H', label: '4H', minutes: 240 },
  { id: '1D', label: '1D', minutes: 1440 },
  { id: '1W', label: '1W', minutes: 10_080 },
  { id: 'ALL', label: 'ALL', minutes: null },
]

function toMs(ts: string | number): number {
  return typeof ts === 'number' ? ts : new Date(ts).getTime()
}

function defaultFmtValue(v: number): string {
  if (v >= 0 && v <= 1) return `${Math.round(v * 100)}¢`
  return v.toFixed(2)
}

function defaultFmtTs(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Catmull-Rom-to-Bezier with tension=1/6 (canonical Catmull-Rom). Endpoints
// are mirrored so the curve doesn't overshoot at the start/end.
function smoothPathFromCoords(coords: Array<[number, number]>): string {
  if (coords.length === 0) return ''
  if (coords.length === 1) return `M${coords[0][0]},${coords[0][1]}`
  if (coords.length === 2) {
    return `M${coords[0][0].toFixed(2)},${coords[0][1].toFixed(2)} L${coords[1][0].toFixed(2)},${coords[1][1].toFixed(2)}`
  }
  const t = 1 / 6
  let d = `M${coords[0][0].toFixed(2)},${coords[0][1].toFixed(2)}`
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i - 1] ?? coords[i]
    const p1 = coords[i]
    const p2 = coords[i + 1]
    const p3 = coords[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) * t
    const c1y = p1[1] + (p2[1] - p0[1]) * t
    const c2x = p2[0] - (p3[0] - p1[0]) * t
    const c2y = p2[1] - (p3[1] - p1[1]) * t
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  return d
}

function straightPathFromCoords(coords: Array<[number, number]>): string {
  if (coords.length === 0) return ''
  return 'M' + coords.map((c) => `${c[0].toFixed(2)},${c[1].toFixed(2)}`).join(' L')
}

function pointsToCoords(
  pts: ChartPoint[],
  width: number,
  height: number,
  tMin: number,
  tMax: number,
  vMin: number,
  vMax: number,
): Array<[number, number]> {
  const tSpan = tMax - tMin || 1
  const vSpan = vMax - vMin || 1
  return pts.map((p) => {
    const t = toMs(p.ts)
    const x = ((t - tMin) / tSpan) * width
    const y = height - ((p.value - vMin) / vSpan) * height
    return [x, y] as [number, number]
  })
}

function ageString(ms: number): string {
  const d = Date.now() - ms
  if (d < 0) return 'in future'
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`
  return `${Math.round(d / 86_400_000)}d ago`
}

export function RobinhoodChart({
  points,
  secondary,
  domain = [0, 1],
  formatValue = defaultFmtValue,
  formatTs = defaultFmtTs,
  showReferenceLine = true,
  smooth = true,
  upColor = DEFAULT_UP,
  downColor = DEFAULT_DOWN,
  height = 320,
  initialRange = 'ALL',
  hideRangePicker = false,
  ariaLabel,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [range, setRange] = useState<RangeId>(initialRange)
  const [chartId] = useState(() => `rh-${Math.random().toString(36).slice(2, 8)}`)
  const [animKey, setAnimKey] = useState(0) // bumps on range change → re-runs draw-in animation

  // Live re-render every 30s so the "Xs ago" counter and the live-dot
  // freshness check stay accurate without page reload.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Trigger draw-in animation when range changes by bumping a key. Inline
  // animation property won't restart on its own since the same SVG node is
  // reused; key change forces a remount of just the path elements.
  useEffect(() => {
    setAnimKey((k) => k + 1)
  }, [range])

  const W = 800

  // Filter points to the active range, then compute geometry. Falls back to
  // ALL if the filter would leave fewer than 2 points.
  const visiblePoints = useMemo(() => {
    const def = RANGES.find((r) => r.id === range)
    if (!def?.minutes) return points
    const cutoff = Date.now() - def.minutes * 60_000
    const f = points.filter((p) => toMs(p.ts) >= cutoff)
    return f.length >= 2 ? f : points
  }, [points, range])

  const geom = useMemo(() => {
    if (visiblePoints.length === 0) return null
    const allPoints = [...visiblePoints, ...(secondary ?? []).flatMap((s) => s.points)]
    let tMin = Infinity
    let tMax = -Infinity
    for (const p of allPoints) {
      const t = toMs(p.ts)
      if (t < tMin) tMin = t
      if (t > tMax) tMax = t
    }
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return null

    const [vMin, vMax] = domain
    const startVal = visiblePoints[0].value
    const endVal = visiblePoints[visiblePoints.length - 1].value
    const isUp = endVal >= startVal
    const lineColor = isUp ? upColor : downColor
    const change = endVal - startVal
    const changePct = startVal > 0 ? change / startVal : 0

    const primaryCoords = pointsToCoords(visiblePoints, W, height, tMin, tMax, vMin, vMax)
    const linePath = smooth
      ? smoothPathFromCoords(primaryCoords)
      : straightPathFromCoords(primaryCoords)
    const areaPath = primaryCoords.length >= 2
      ? `${linePath} L${primaryCoords[primaryCoords.length - 1][0].toFixed(2)},${height} L${primaryCoords[0][0].toFixed(2)},${height} Z`
      : ''

    return {
      tMin,
      tMax,
      vMin,
      vMax,
      lineColor,
      isUp,
      startVal,
      endVal,
      change,
      changePct,
      linePath,
      areaPath,
      refY: height - ((startVal - vMin) / (vMax - vMin)) * height,
      screen: visiblePoints.map((p) => {
        const t = toMs(p.ts)
        const x = ((t - tMin) / (tMax - tMin || 1)) * W
        const y = height - ((p.value - vMin) / (vMax - vMin || 1)) * height
        return { x, y, ts: t, value: p.value }
      }),
      lastTs: toMs(visiblePoints[visiblePoints.length - 1].ts),
    }
  }, [visiblePoints, secondary, domain, upColor, downColor, height, smooth])

  if (!geom) {
    return (
      <div
        className="w-full bg-stone-50 rounded flex items-center justify-center text-xs text-stone-400"
        style={{ height }}
      >
        No price data yet.
      </div>
    )
  }

  const handleMove = (clientX: number) => {
    const el = containerRef.current
    if (!el || geom.screen.length === 0) return
    const rect = el.getBoundingClientRect()
    const fracX = (clientX - rect.left) / rect.width
    const xInSvg = fracX * W
    let bestIdx = 0
    let bestDx = Infinity
    for (let i = 0; i < geom.screen.length; i++) {
      const dx = Math.abs(geom.screen[i].x - xInSvg)
      if (dx < bestDx) {
        bestDx = dx
        bestIdx = i
      }
    }
    setHoverIdx(bestIdx)
  }

  const hover = hoverIdx != null ? geom.screen[hoverIdx] : null
  const hoverLeftPct = hover ? (hover.x / W) * 100 : 0
  const hoverTopPct = hover ? (hover.y / height) * 100 : 0
  const isLive = Date.now() - geom.lastTs < 90_000
  const lastAge = ageString(geom.lastTs)

  return (
    <div className="relative w-full" style={{ height }} aria-label={ariaLabel}>
      {/* Style block: animation keyframes + live-pulse */}
      <style>{`
        @keyframes rh-draw-${chartId} { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes rh-fade-${chartId} { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rh-pulse-${chartId} {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        .rh-line-${chartId} {
          stroke-dasharray: 1;
          stroke-dashoffset: 0;
          animation: rh-draw-${chartId} 700ms ease-out;
        }
        .rh-area-${chartId} { animation: rh-fade-${chartId} 700ms ease-out; }
        .rh-pulse-${chartId} { animation: rh-pulse-${chartId} 1.6s ease-in-out infinite; transform-origin: center; }
      `}</style>

      {/* Top-left: current value + delta + timestamp */}
      <div className="absolute top-1 left-1 z-10 pointer-events-none">
        <div className="text-2xl font-bold text-stone-900 tabular-nums leading-none">
          {hover ? formatValue(hover.value) : formatValue(geom.endVal)}
        </div>
        <div
          className="text-xs font-mono mt-1 flex items-center gap-2"
          style={{ color: geom.isUp ? upColor : downColor }}
        >
          <span>
            {geom.change >= 0 ? '+' : ''}
            {formatValue(geom.change)} ({(geom.changePct * 100).toFixed(2)}%)
          </span>
          <span className="text-stone-400">
            {hover ? formatTs(hover.ts) : range === 'ALL' ? 'all time' : `past ${range.toLowerCase()}`}
          </span>
        </div>
      </div>

      {/* Top-right: live indicator + timeframe pills */}
      <div className="absolute top-1 right-1 z-10 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          {isLive ? (
            <>
              <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 rh-pulse-${chartId}`} />
              <span className="text-emerald-600 tracking-wider">LIVE</span>
              <span className="text-stone-400">· {lastAge}</span>
            </>
          ) : (
            <span className="text-stone-400">updated {lastAge}</span>
          )}
        </div>
        {!hideRangePicker && (
          <div className="flex items-center gap-0.5 bg-stone-100 rounded-md p-0.5">
            {RANGES.map((r) => {
              const active = range === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={`px-2 py-0.5 text-[10px] font-mono tracking-wider rounded transition ${
                    active
                      ? 'bg-white text-stone-900 shadow-sm font-semibold'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                  aria-pressed={active}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchMove={(e) => {
          if (e.touches[0]) handleMove(e.touches[0].clientX)
        }}
        onTouchEnd={() => setHoverIdx(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id={`${chartId}-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={geom.lineColor} stopOpacity="0.32" />
              <stop offset="60%" stopColor={geom.lineColor} stopOpacity="0.08" />
              <stop offset="100%" stopColor={geom.lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Secondary lines (cross-book comparison) — render BEHIND, muted, no smoothing */}
          {secondary?.map((s) => {
            const coords = pointsToCoords(s.points, W, height, geom.tMin, geom.tMax, geom.vMin, geom.vMax)
            if (coords.length < 2) return null
            return (
              <path
                key={s.label}
                d={straightPathFromCoords(coords)}
                fill="none"
                stroke={s.color ?? SECONDARY_DEFAULT}
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.65"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {/* Dashed reference line at the visible-range start price */}
          {showReferenceLine && (
            <line
              x1="0"
              x2={W}
              y1={geom.refY}
              y2={geom.refY}
              stroke="rgb(168 162 158)"
              strokeWidth="1"
              strokeDasharray="3 5"
              opacity="0.5"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Filled area under the primary line — fades in alongside the line draw */}
          {geom.areaPath && (
            <path
              key={`area-${animKey}`}
              d={geom.areaPath}
              fill={`url(#${chartId}-grad)`}
              stroke="none"
              className={`rh-area-${chartId}`}
            />
          )}

          {/* Primary line — emphasized, animated draw-in */}
          {geom.linePath && (
            <path
              key={`line-${animKey}`}
              d={geom.linePath}
              fill="none"
              stroke={geom.lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              className={`rh-line-${chartId}`}
            />
          )}

          {/* Hover crosshair */}
          {hover && (
            <>
              <line
                x1={hover.x}
                x2={hover.x}
                y1="0"
                y2={height}
                stroke="rgb(120 113 108)"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.5"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={hover.x}
                cy={hover.y}
                r="5"
                fill={geom.lineColor}
                stroke="white"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* Hover popover — value, delta from start, formatted timestamp */}
        {hover && (
          <div
            className="absolute -translate-x-1/2 -translate-y-full mt-[-12px] px-2.5 py-1.5 rounded-md bg-stone-900 text-white text-[11px] font-mono tabular-nums whitespace-nowrap pointer-events-none shadow-lg ring-1 ring-stone-700"
            style={{ left: `${hoverLeftPct}%`, top: `${hoverTopPct}%` }}
          >
            <div className="font-semibold text-stone-100">{formatValue(hover.value)}</div>
            <div className="text-[10px] text-stone-400 mt-0.5">{formatTs(hover.ts)}</div>
          </div>
        )}
      </div>

      {/* Bottom-left footer: point count + secondary legend */}
      <div className="absolute bottom-0 left-1 right-1 flex items-center justify-between text-[10px] text-stone-500 font-mono pointer-events-none">
        <div className="flex items-center gap-3">
          <span>
            {geom.screen.length} pts
            {visiblePoints.length < points.length && (
              <span className="text-stone-400"> (of {points.length})</span>
            )}
          </span>
          {secondary && secondary.length > 0 && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-2 h-0.5" style={{ backgroundColor: geom.lineColor }} />
                primary
              </span>
              {secondary.map((s) => (
                <span key={s.label} className="flex items-center gap-1">
                  <span
                    className="w-2 h-0.5"
                    style={{ backgroundColor: s.color ?? SECONDARY_DEFAULT }}
                  />
                  {s.label}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Lightweight non-interactive variant for cards / lists. Smoothing OFF by
// default — at 100×30 the smoothed and straight versions are visually
// indistinguishable, and straight is cheaper.
// ────────────────────────────────────────────────────────────────────────────

interface SparklineProps {
  points: ChartPoint[]
  domain?: [number, number]
  height?: number
  upColor?: string
  downColor?: string
  smooth?: boolean
  className?: string
}

export function RobinhoodSparkline({
  points,
  domain = [0, 1],
  height = 36,
  upColor = DEFAULT_UP,
  downColor = DEFAULT_DOWN,
  smooth = false,
  className,
}: SparklineProps) {
  const id = useMemo(() => `sl-${Math.random().toString(36).slice(2, 8)}`, [])
  const W = 100

  const geom = useMemo(() => {
    if (points.length < 2) return null
    let tMin = Infinity
    let tMax = -Infinity
    for (const p of points) {
      const t = toMs(p.ts)
      if (t < tMin) tMin = t
      if (t > tMax) tMax = t
    }
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return null
    const [vMin, vMax] = domain
    const isUp = points[points.length - 1].value >= points[0].value
    const coords = pointsToCoords(points, W, height, tMin, tMax, vMin, vMax)
    const linePath = smooth ? smoothPathFromCoords(coords) : straightPathFromCoords(coords)
    const areaPath =
      coords.length >= 2
        ? `${linePath} L${coords[coords.length - 1][0].toFixed(2)},${height} L${coords[0][0].toFixed(2)},${height} Z`
        : ''
    return { lineColor: isUp ? upColor : downColor, linePath, areaPath }
  }, [points, domain, upColor, downColor, height, smooth])

  if (!geom) {
    return <div className={className} style={{ height, width: '100%' }} aria-hidden />
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className={className ?? 'w-full'}
      style={{ height }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={geom.lineColor} stopOpacity="0.4" />
          <stop offset="100%" stopColor={geom.lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {geom.areaPath && <path d={geom.areaPath} fill={`url(#${id}-grad)`} />}
      {geom.linePath && (
        <path
          d={geom.linePath}
          fill="none"
          stroke={geom.lineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
