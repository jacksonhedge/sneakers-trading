import Link from 'next/link'
import { CATEGORY_META, type CategoryStats, formatPct, formatVolume, type TerminalCategory } from '@/lib/market-stats'

const CHIPS: Array<{ id: '' | TerminalCategory; label: string; icon: string }> = [
  { id: '', label: 'All Markets', icon: '◉' },
  { id: 'sports', label: 'Sports', icon: '🏆' },
  { id: 'politics', label: 'Politics', icon: '🗳️' },
  { id: 'economics', label: 'Economics', icon: '📊' },
  { id: 'crypto', label: 'Crypto', icon: '₿' },
  { id: 'tech', label: 'Tech', icon: '▣' },
  { id: 'other', label: 'Other', icon: '🌐' },
]

export function CategoryNav({ activeCategory }: { activeCategory?: TerminalCategory | '' }) {
  const active = activeCategory ?? ''
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        {CHIPS.map((c) => {
          const isActive = c.id === active
          const href = c.id === '' ? '/markets' : `/markets?category=${c.id}`
          return (
            <Link
              key={c.id || 'all'}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs tracking-wider rounded-full ring-1 transition ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-400/60'
                  : 'text-stone-800 ring-stone-300 hover:bg-stone-100'
              }`}
            >
              <span>{c.icon}</span>
              <span>{c.label}</span>
            </Link>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-wider rounded-full bg-violet-500/10 text-violet-600 ring-1 ring-violet-400/40">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> New
        </span>
        <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] tracking-wider rounded-full bg-amber-500/10 text-amber-600 ring-1 ring-amber-400/40">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Trending
        </span>
      </div>
    </div>
  )
}

export function CategoryCards({ stats }: { stats: Record<string, CategoryStats> }) {
  // Show the 4 headline categories matching the Bloomberg-style reference.
  const show: Array<{ id: keyof typeof CATEGORY_META; subtitle: string }> = [
    { id: 'politics', subtitle: '2024–26' },
    { id: 'economics', subtitle: 'FED+' },
    { id: 'crypto', subtitle: 'DEGEN' },
    { id: 'sports', subtitle: 'LIVE' },
  ]
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {show.map((row) => {
        const meta = CATEGORY_META[row.id]
        const s = stats[row.id]
        return (
          <Link
            key={row.id}
            href={`/markets?category=${row.id}`}
            className="flex items-start gap-3 rounded border border-stone-200 bg-white px-4 py-3 hover:border-emerald-400/60 hover:shadow-sm transition"
          >
            <div
              className={`w-9 h-9 rounded flex items-center justify-center text-[10px] font-bold tracking-wider ring-1 ${meta.badgeCls}`}
            >
              {meta.short}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-stone-900">{meta.label}</span>
                <span className="text-[10px] text-stone-800 tracking-wider">{row.subtitle}</span>
              </div>
              <div className="text-[11px] text-stone-700 mt-0.5">
                {s.activeCount.toLocaleString()} active markets
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-stone-800 tracking-wider">Avg Prob</div>
              <div className="text-lg font-bold text-stone-900 font-mono tabular-nums">{formatPct(s.avgProb)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-stone-800 tracking-wider">24h Vol</div>
              <div className="text-sm font-semibold text-stone-700 font-mono tabular-nums">
                {formatVolume(s.volume24h)}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
