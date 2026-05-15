'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

// Robinhood-style chart, Phase 1 polish + volume band.
//
// What's new vs the original RobinhoodChart:
//   - Pulsing endpoint dot with breathing halo (the "heartbeat")
//   - End-of-line radial glow drawing the eye to current price
//   - Auto-scaling Y domain with padding (no more flat lines for
//     tight-range markets); caller can override with `domain`
//   - Tighter gradient ramp (peaks at 28%, fades around 70% height)
//   - Magnetic crosshair scale-up on point change
//   - Optional haptic feedback on touch scrub
//   - Optional VOLUME bars in a bottom band (when points carry .volume).
//     Compresses the price area to the top 73% so the bars get a real
//     home without the price line looking squashed.

export type ChartPoint = {
  ts: string | number
  value: number
  /** Optional per-period volume / liquidity. When at least one point
   *  in the visible window carries this, the chart reserves a bottom
   *  band for volume bars. */
  volume?: number
}

export type SecondaryLine = {
  label: string
  points: ChartPoint[]
  color?: string
}

type RangeId = '1H' | '4H' | '1D' | '1W' | 'ALL'

interface Props {
  points: ChartPoint[]
  secondary?: SecondaryLine[]
  domain?: [number, number]
  autoScalePadding?: number
  formatValue?: (v: number) => string
  formatVolume?: (v: number) => string
  formatTs?: (ts: number) => string
  showReferenceLine?: boolean
  smooth?: boolean
  upColor?: string
  downColor?: string
  height?: number
  initialRange?: RangeId
  hideRangePicker?: boolean
  pulseEndpoint?: boolean
  haptic?: boolean
  /** When set, renders this emoji at the line's last point in place of
   *  the pulsing dot. Used by the horse-race surface so the BTC line
   *  literally has a horse riding its current price. */
  endpointEmoji?: string
  /** Optional horizontal reference lines drawn across the chart at
   *  specific Y values. Useful for marking strike levels, take-profit
   *  thresholds, etc. */
  referenceLines?: Array<{
    value: number
    label?: string
    color?: string
    dashed?: boolean
  }>
  ariaLabel?: string
}

const DEFAULT_UP = '#00703c' // brand emerald (matches RollingNumber up-flash)
const DEFAULT_DOWN = '#ef4444'
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
  if (v >= 0 && v <= 1) return `${(v * 100).toFixed(1)}¢`
  return v.toFixed(2)
}

function defaultFmtVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return v.toFixed(0)
}

function defaultFmtTs(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

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

function ageString(ms: number): string {
  const d = Date.now() - ms
  if (d < 0) return 'in future'
  if (d < 60_000) return `${Math.round(d / 1000)}s ago`
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`
  return `${Math.round(d / 86_400_000)}d ago`
}

export function RobinhoodChartV2({
  points,
  secondary,
  domain,
  autoScalePadding = 0.12,
  formatValue = defaultFmtValue,
  formatVolume = defaultFmtVolume,
  formatTs = defaultFmtTs,
  showReferenceLine = true,
  smooth = true,
  upColor = DEFAULT_UP,
  downColor = DEFAULT_DOWN,
  height = 320,
  initialRange = 'ALL',
  hideRangePicker = false,
  pulseEndpoint = true,
  haptic = true,
  endpointEmoji,
  referenceLines,
  ariaLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [range, setRange] = useState<RangeId>(initialRange)
  const reactId = useId()
  const chartId = `rhv2-${reactId.replace(/[:]/g, '')}`
  const [animKey, setAnimKey] = useState(0)
  const lastHoverRef = useRef<number | null>(null)

  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setAnimKey((k) => k + 1)
  }, [range])

  useEffect(() => {
    if (!haptic) return
    if (hoverIdx == null) {
      lastHoverRef.current = null
      return
    }
    if (lastHoverRef.current !== null && lastHoverRef.current !== hoverIdx) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(6)
      }
    }
    lastHoverRef.current = hoverIdx
  }, [hoverIdx, haptic])

  const W = 800

  const visiblePoints = useMemo(() => {
    const def = RANGES.find((r) => r.id === range)
    if (!def?.minutes) return points
    const cutoff = Date.now() - def.minutes * 60_000
    const f = points.filter((p) => toMs(p.ts) >= cutoff)
    return f.length >= 2 ? f : points
  }, [points, range])

  const geom = useMemo(() => {
    if (visiblePoints.length === 0) return null

    const hasVolume = visiblePoints.some(
      (p) => typeof p.volume === 'number' && Number.isFinite(p.volume),
    )
    // Layout: top 73% for price line, 4% gap, bottom 23% for volume bars.
    // When no volume data is present, price uses the full height — same as
    // the no-volume mode of the original chart.
    const PRICE_FRAC = hasVolume ? 0.73 : 1
    const GAP_FRAC = hasVolume ? 0.04 : 0
    const VOL_FRAC = hasVolume ? 0.23 : 0
    const priceH = height * PRICE_FRAC
    const volumeY0 = height * (PRICE_FRAC + GAP_FRAC)
    const volumeH = height * VOL_FRAC

    let tMin = Infinity
    let tMax = -Infinity
    let dataMin = Infinity
    let dataMax = -Infinity
    let maxVol = 0
    for (const p of visiblePoints) {
      const t = toMs(p.ts)
      if (t < tMin) tMin = t
      if (t > tMax) tMax = t
      if (p.value < dataMin) dataMin = p.value
      if (p.value > dataMax) dataMax = p.value
      if (typeof p.volume === 'number' && p.volume > maxVol) maxVol = p.volume
    }
    for (const s of secondary ?? []) {
      for (const p of s.points) {
        const t = toMs(p.ts)
        if (t < tMin) tMin = t
        if (t > tMax) tMax = t
      }
    }
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return null

    let vMin: number
    let vMax: number
    if (domain) {
      ;[vMin, vMax] = domain
    } else {
      const range = dataMax - dataMin
      const pad = range > 0 ? range * autoScalePadding : 0.02
      vMin = dataMin - pad
      vMax = dataMax + pad
    }

    const startVal = visiblePoints[0].value
    const endVal = visiblePoints[visiblePoints.length - 1].value
    const isUp = endVal >= startVal
    const lineColor = isUp ? upColor : downColor
    const change = endVal - startVal
    const changePct = startVal > 0 ? change / startVal : 0

    const tSpan = tMax - tMin || 1
    const vSpan = vMax - vMin || 1
    const screen = visiblePoints.map((p) => {
      const t = toMs(p.ts)
      const x = ((t - tMin) / tSpan) * W
      const y = priceH - ((p.value - vMin) / vSpan) * priceH
      const volume = typeof p.volume === 'number' ? p.volume : null
      const barH = hasVolume && maxVol > 0 && volume != null ? (volume / maxVol) * volumeH : 0
      return { x, y, ts: t, value: p.value, volume, barH }
    })

    const coords: Array<[number, number]> = screen.map((s) => [s.x, s.y])
    const linePath = smooth ? smoothPathFromCoords(coords) : straightPathFromCoords(coords)
    const areaPath =
      coords.length >= 2
        ? `${linePath} L${coords[coords.length - 1][0].toFixed(2)},${priceH} L${coords[0][0].toFixed(2)},${priceH} Z`
        : ''

    const refY = priceH - ((startVal - vMin) / vSpan) * priceH
    const last = screen[screen.length - 1]

    // Approximate per-bar width: total width / bar count, then 60% of slot
    // for the bar so adjacent bars have breathing room.
    const barW = Math.max(1, (W / Math.max(1, visiblePoints.length)) * 0.6)

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
      refY,
      screen,
      last,
      lastTs: toMs(visiblePoints[visiblePoints.length - 1].ts),
      hasVolume,
      priceH,
      volumeY0,
      volumeH,
      maxVol,
      barW,
    }
  }, [visiblePoints, secondary, domain, upColor, downColor, height, smooth, autoScalePadding])

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

  const glowR = Math.min(120, geom.priceH * 0.45)

  return (
    <div className="relative w-full" style={{ height }} aria-label={ariaLabel}>
      <style>{`
        @keyframes ${chartId}-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes ${chartId}-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ${chartId}-pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.2); opacity: 0.85; }
        }
        @keyframes ${chartId}-pulse-halo {
          0%   { transform: scale(0.85); opacity: 0.55; }
          75%  { transform: scale(2.0);  opacity: 0; }
          100% { transform: scale(2.0);  opacity: 0; }
        }
        .${chartId}-line {
          stroke-dasharray: 1;
          stroke-dashoffset: 0;
          animation: ${chartId}-draw 700ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .${chartId}-area { animation: ${chartId}-fade 700ms ease-out; }
        .${chartId}-dot { animation: ${chartId}-pulse-dot 1.5s ease-in-out infinite; }
        .${chartId}-halo { animation: ${chartId}-pulse-halo 1.8s ease-out infinite; }
        .${chartId}-bar { transition: opacity 150ms ease-out; }
      `}</style>

      <div className="absolute top-1 left-1 z-10 pointer-events-none">
        <div className="text-2xl font-bold text-stone-900 tabular-nums leading-none font-mono">
          {hover ? formatValue(hover.value) : formatValue(geom.endVal)}
        </div>
        <div
          className="text-xs font-mono mt-1 flex items-center gap-2 tabular-nums"
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
        {hover && hover.volume != null && (
          <div className="text-[10px] font-mono text-stone-500 tabular-nums mt-0.5">
            vol {formatVolume(hover.volume)}
          </div>
        )}
      </div>

      <div className="absolute top-1 right-1 z-10 flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          {isLive ? (
            <>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: geom.lineColor, animation: `${chartId}-pulse-dot 1.5s ease-in-out infinite` }}
              />
              <span style={{ color: geom.lineColor }} className="tracking-wider">LIVE</span>
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
                    active ? 'bg-white text-stone-900 shadow-sm font-semibold' : 'text-stone-500 hover:text-stone-800'
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
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={`${chartId}-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={geom.lineColor} stopOpacity="0.28" />
              <stop offset="50%" stopColor={geom.lineColor} stopOpacity="0.10" />
              <stop offset="80%" stopColor={geom.lineColor} stopOpacity="0.02" />
              <stop offset="100%" stopColor={geom.lineColor} stopOpacity="0" />
            </linearGradient>
            <radialGradient id={`${chartId}-endglow`}>
              <stop offset="0%" stopColor={geom.lineColor} stopOpacity="0.35" />
              <stop offset="60%" stopColor={geom.lineColor} stopOpacity="0.08" />
              <stop offset="100%" stopColor={geom.lineColor} stopOpacity="0" />
            </radialGradient>
          </defs>

          {secondary?.map((s) => {
            const tSpan = geom.tMax - geom.tMin || 1
            const vSpan = geom.vMax - geom.vMin || 1
            const coords: Array<[number, number]> = s.points.map((p) => {
              const t = toMs(p.ts)
              return [
                ((t - geom.tMin) / tSpan) * W,
                geom.priceH - ((p.value - geom.vMin) / vSpan) * geom.priceH,
              ]
            })
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

          {/* Custom reference lines (e.g., strike levels) — clipped to
              the price area so they don't bleed into the volume band */}
          {referenceLines?.map((rl, i) => {
            const vSpan = geom.vMax - geom.vMin || 1
            const y = geom.priceH - ((rl.value - geom.vMin) / vSpan) * geom.priceH
            // Skip lines outside the visible price range
            if (y < 0 || y > geom.priceH) return null
            const stroke = rl.color ?? 'rgb(120 113 108)'
            return (
              <g key={`ref-${i}-${rl.value}`}>
                <line
                  x1="0"
                  x2={W}
                  y1={y}
                  y2={y}
                  stroke={stroke}
                  strokeWidth="1"
                  strokeDasharray={rl.dashed === false ? undefined : '4 6'}
                  opacity="0.55"
                  vectorEffect="non-scaling-stroke"
                />
                {rl.label && (
                  <foreignObject x={W - 80} y={Math.max(0, y - 10)} width="78" height="18" style={{ overflow: 'visible' }}>
                    <div
                      className="text-[9px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded inline-block"
                      style={{
                        background: stroke,
                        color: 'white',
                        opacity: 0.85,
                      }}
                      aria-hidden
                    >
                      {rl.label}
                    </div>
                  </foreignObject>
                )}
              </g>
            )
          })}

          <ellipse
            cx={geom.last.x}
            cy={geom.last.y}
            rx={glowR}
            ry={glowR * 0.7}
            fill={`url(#${chartId}-endglow)`}
            opacity={0.85}
          />

          {geom.areaPath && (
            <path
              key={`area-${animKey}`}
              d={geom.areaPath}
              fill={`url(#${chartId}-grad)`}
              stroke="none"
              className={`${chartId}-area`}
            />
          )}

          {geom.linePath && (
            <path
              key={`line-${animKey}`}
              d={geom.linePath}
              fill="none"
              stroke={geom.lineColor}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              className={`${chartId}-line`}
            />
          )}

          {pulseEndpoint && !hover && !endpointEmoji && (
            <g>
              <circle
                cx={geom.last.x}
                cy={geom.last.y}
                r="9"
                fill={geom.lineColor}
                opacity="0.4"
                className={`${chartId}-halo`}
                style={{ transformOrigin: `${geom.last.x}px ${geom.last.y}px` }}
              />
              <circle
                cx={geom.last.x}
                cy={geom.last.y}
                r="4.5"
                fill={geom.lineColor}
                stroke="white"
                strokeWidth="2"
                className={`${chartId}-dot`}
                style={{ transformOrigin: `${geom.last.x}px ${geom.last.y}px` }}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}

          {/* Custom endpoint — emoji "cursor" version. Rendered as foreignObject
              so we can use a real DOM span (better emoji rendering than SVG
              <text>) with our pulse animation. Halo behind for visibility. */}
          {pulseEndpoint && !hover && endpointEmoji && (
            <g style={{ transformBox: 'fill-box' }}>
              <circle
                cx={geom.last.x}
                cy={geom.last.y}
                r="14"
                fill={geom.lineColor}
                opacity="0.35"
                className={`${chartId}-halo`}
                style={{ transformOrigin: `${geom.last.x}px ${geom.last.y}px` }}
              />
              <foreignObject
                x={geom.last.x - 16}
                y={geom.last.y - 16}
                width="32"
                height="32"
                style={{ overflow: 'visible' }}
              >
                <div
                  className={`${chartId}-dot`}
                  style={{
                    transformOrigin: 'center',
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    lineHeight: 1,
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
                  }}
                  aria-hidden
                >
                  {endpointEmoji}
                </div>
              </foreignObject>
            </g>
          )}

          {/* Volume band — bars + faint baseline divider */}
          {geom.hasVolume && (
            <>
              {/* Faint baseline at the top of the volume area, signals
                  the visual separation without yelling. */}
              <line
                x1="0"
                x2={W}
                y1={geom.volumeY0}
                y2={geom.volumeY0}
                stroke="rgb(214 211 209)"
                strokeWidth="1"
                opacity="0.6"
                vectorEffect="non-scaling-stroke"
              />
              {geom.screen.map((s, i) => {
                if (s.volume == null || s.barH <= 0) return null
                const isHovered = hoverIdx === i
                return (
                  <rect
                    key={`bar-${i}`}
                    x={s.x - geom.barW / 2}
                    y={geom.volumeY0 + (geom.volumeH - s.barH)}
                    width={geom.barW}
                    height={s.barH}
                    fill={geom.lineColor}
                    opacity={isHovered ? 0.85 : 0.32}
                    className={`${chartId}-bar`}
                    rx={Math.min(1.5, geom.barW / 4)}
                  />
                )
              })}
            </>
          )}

          {hover && (
            <>
              <line
                x1={hover.x}
                x2={hover.x}
                y1="0"
                y2={geom.hasVolume ? height : geom.priceH}
                stroke="rgb(120 113 108)"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.5"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={hover.x}
                cy={hover.y}
                r="6"
                fill={geom.lineColor}
                stroke="white"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {hover && (
          <div
            className="absolute -translate-x-1/2 -translate-y-full mt-[-12px] px-2.5 py-1.5 rounded-md bg-stone-900 text-white text-[11px] font-mono tabular-nums whitespace-nowrap pointer-events-none shadow-lg ring-1 ring-stone-700"
            style={{ left: `${hoverLeftPct}%`, top: `${hoverTopPct}%` }}
          >
            <div className="font-semibold text-stone-100">{formatValue(hover.value)}</div>
            <div className="text-[10px] text-stone-400 mt-0.5">{formatTs(hover.ts)}</div>
            {hover.volume != null && (
              <div className="text-[10px] text-stone-300 mt-0.5">
                vol {formatVolume(hover.volume)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
