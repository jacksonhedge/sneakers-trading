import { CATEGORY_META, formatPct, type CategoryStats, type TerminalCategory } from '@/lib/market-stats'

export function RightSidebar({ stats }: { stats: Record<TerminalCategory, CategoryStats> }) {
  const cats: TerminalCategory[] = ['politics', 'economics', 'crypto', 'sports', 'tech']
  return (
    <aside className="w-72 shrink-0 border-l border-stone-200 bg-white/60 backdrop-blur-sm flex flex-col">
      {/* O'Toole chat */}
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-stone-950 flex items-center justify-center text-[10px] text-emerald-400 font-bold ring-1 ring-emerald-400/30">
            Ø
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-stone-900">O&apos;Toole</div>
            <div className="text-[11px] text-emerald-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active · AI Trading
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-[9px] text-stone-400 tracking-wider">Auto</div>
            <div className="w-8 h-4 rounded-full bg-stone-300 mt-0.5 relative">
              <div className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white shadow" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['Find Edge', 'Whale Alerts', 'Portfolio Risk', 'Best Bets'].map((chip) => (
            <button
              key={chip}
              className="text-[10px] tracking-wider px-2.5 py-1 rounded-full ring-1 ring-stone-300 text-stone-600 hover:bg-stone-100 transition"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        <div className="bg-stone-100 rounded-lg p-3 text-xs text-stone-800 leading-relaxed">
          Good evening. I&apos;ve scanned active markets across Kalshi, Polymarket, NoVig and
          ProphetX. Ask me about any specific market or click a chip below.
          <div className="text-[9px] text-stone-400 mt-2 tracking-wider">9:05 PM</div>
        </div>
      </div>

      {/* Category performance — shares data with the top cards */}
      <div className="border-t border-stone-200 p-4">
        <div className="text-sm font-semibold text-stone-900 mb-3 flex items-center justify-between">
          <span>Category Performance</span>
          <span className="text-[10px] text-stone-400">1W ▾</span>
        </div>
        <div className="space-y-2">
          {cats.map((c) => {
            const meta = CATEGORY_META[c]
            const s = stats[c]
            const pct = s.avgProb ?? 0
            return (
              <div key={c} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold tracking-wider ring-1 ${meta.badgeCls} shrink-0`}
                >
                  {meta.short}
                </span>
                <span className="text-stone-700 w-16 shrink-0">{meta.label}</span>
                <span className="text-stone-900 tabular-nums font-semibold w-10 text-right">
                  {formatPct(s.avgProb)}
                </span>
                <div className="flex-1 h-1.5 bg-stone-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(100, pct * 100)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chat input */}
      <div className="border-t border-stone-200 p-3">
        <div className="flex items-center gap-2 bg-stone-100 rounded px-3 py-2">
          <input
            type="text"
            disabled
            placeholder="Ask O'Toole anything…"
            className="flex-1 bg-transparent text-xs text-stone-700 placeholder:text-stone-400 focus:outline-none"
          />
          <button className="w-6 h-6 rounded bg-emerald-500/80 text-white flex items-center justify-center text-xs">
            →
          </button>
        </div>
      </div>
    </aside>
  )
}
