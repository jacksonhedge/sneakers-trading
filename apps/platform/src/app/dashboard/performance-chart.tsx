import { CATEGORY_META, type TerminalCategory } from '@/lib/market-stats'

// Placeholder normalized-performance chart. Once we have a time series per
// category (currently we only have single snapshots — the scraper appends,
// but we don't yet compute per-category rollups over time), replace this
// with a real SVG line chart or `lightweight-charts`.
//
// For now, render synthesized curves based on each category's current avgProb
// so the shape is visually plausible and distinct per-category.
export function PerformanceChart({ avgProbs }: { avgProbs: Partial<Record<TerminalCategory, number | null>> }) {
  const cats: TerminalCategory[] = ['economics', 'politics', 'crypto', 'sports']
  const width = 600
  const height = 180
  const padX = 24
  const padY = 16

  // Each category gets a monotone-ish curve from 5% on the left to its current
  // avgProb on the right. Adds a small wobble in the middle so it reads as a
  // chart rather than a straight line. This is a STUB — see comment above.
  function pathFor(prob: number | null): string {
    const end = prob !== null ? Math.max(0.05, Math.min(0.95, prob)) : 0.3
    const start = 0.05
    const points: Array<[number, number]> = []
    const steps = 30
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const y = start + (end - start) * (t * t * (3 - 2 * t)) // smoothstep
      const wobble = Math.sin(t * Math.PI * 3) * 0.015 * (1 - t)
      points.push([t, y + wobble])
    }
    const w = width - padX * 2
    const h = height - padY * 2
    return (
      'M' +
      points
        .map(([t, y]) => `${(padX + t * w).toFixed(1)},${(height - padY - y * h).toFixed(1)}`)
        .join(' L')
    )
  }

  return (
    <div className="rounded border border-stone-200 bg-white h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div className="text-sm font-semibold text-stone-900">Normalized Market Performance</div>
        <div className="flex items-center gap-3 text-[10px]">
          {cats.map((c) => (
            <span key={c} className="flex items-center gap-1 text-stone-500">
              <span className={`w-2 h-2 rounded-full ${CATEGORY_META[c].lineCls.replace('stroke', 'bg')}`} />
              {CATEGORY_META[c].label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center px-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
          {/* Y-axis grid lines */}
          {[0, 0.1, 0.3, 0.5].map((y) => {
            const py = height - padY - y * (height - padY * 2)
            return (
              <g key={y}>
                <line x1={padX} x2={width - padX} y1={py} y2={py} className="stroke-stone-100" strokeWidth={1} />
                <text x={padX - 6} y={py + 3} className="fill-stone-400 text-[9px]" textAnchor="end">
                  {(y * 100).toFixed(0)}%
                </text>
              </g>
            )
          })}
          {cats.map((c) => (
            <path
              key={c}
              d={pathFor(avgProbs[c] ?? null)}
              fill="none"
              strokeWidth={2}
              className={CATEGORY_META[c].lineCls}
            />
          ))}
        </svg>
        <div className="text-[10px] text-stone-400 text-center mt-1">
          stub · real time-series pending a per-category rollup from JSONL
        </div>
      </div>
    </div>
  )
}
