// Decorative dashboard mockup that renders behind the signup form. Static
// JSX, no data fetches, no auth — works even when scrapers are offline.
// Recreates the visual texture of the real /dashboard layout (topbar,
// sidebar, three main tiles, market detail row) using the same color
// palette so the form-on-top looks like an actual takeover, not a marketing
// page.
//
// Heavy aria-hidden + pointer-events-none in the parent so screen readers
// + keyboard nav skip this entirely.

const CATEGORIES = ['Sports', 'Politics', 'Crypto', 'Economics', 'Tech', 'Other']
const ROWS = [
  { sym: '🏀', q: 'Lakers @ Warriors', pct: '47%', delta: '+3.2%', vol: '$48k' },
  { sym: '⚾', q: 'NYY @ BOS', pct: '54%', delta: '+1.8%', vol: '$32k' },
  { sym: '₿', q: 'BTC > $100k by EOM', pct: '42%', delta: '−5.8%', vol: '$2.4M' },
  { sym: '🗳️', q: 'Senate Dems control', pct: '48%', delta: '+2.7%', vol: '$412k' },
  { sym: 'Ξ', q: 'ETH > $4k EOW', pct: '63%', delta: '+3.9%', vol: '$98k' },
  { sym: '🏈', q: 'KC @ BUF spread', pct: '51%', delta: '+0.4%', vol: '$184k' },
]

export function TerminalBackdrop() {
  return (
    <div className="w-full h-full bg-stone-50 text-stone-900 font-sans">
      {/* Topbar */}
      <div className="h-14 border-b border-stone-200 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="w-7 h-7 rounded-full bg-emerald-500 ring-1 ring-emerald-400" />
          <div className="text-sm font-bold tracking-tight">Sneakers Terminal</div>
          <div className="text-[10px] tracking-wider text-stone-400 ml-4">
            ALL · LIVE · 2,400+ MARKETS
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[10px] tracking-wider text-stone-400">UPDATED 2m ago</div>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600" />
        </div>
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-[200px_1fr_280px] h-[calc(100%-56px)]">
        {/* Sidebar */}
        <aside className="border-r border-stone-200 bg-white p-3 space-y-1">
          {['Dashboard', 'Markets', 'Leaderboard', 'O\'Toole', 'Settings'].map((item, i) => (
            <div
              key={item}
              className={`text-xs px-3 py-2 rounded ${
                i === 0
                  ? 'bg-emerald-100 text-emerald-800 font-semibold'
                  : 'text-stone-600'
              }`}
            >
              {item}
            </div>
          ))}
          <div className="pt-4 mt-4 border-t border-stone-200">
            <div className="text-[10px] tracking-wider text-stone-400 px-3 py-2">
              CATEGORIES
            </div>
            {CATEGORIES.map((c) => (
              <div key={c} className="text-xs text-stone-600 px-3 py-1.5">
                {c}
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="p-5 space-y-4 overflow-hidden">
          {/* Category chips */}
          <div className="flex gap-2">
            {CATEGORIES.map((c, i) => (
              <div
                key={c}
                className={`text-[10px] tracking-wider px-3 py-1.5 rounded-full ring-1 ${
                  i === 0
                    ? 'bg-emerald-100 text-emerald-800 ring-emerald-300'
                    : 'bg-white text-stone-600 ring-stone-200'
                }`}
              >
                {c}
              </div>
            ))}
          </div>

          {/* 3-column tiles */}
          <div className="grid grid-cols-3 gap-3">
            {['Biggest Volume', 'Arbitrage', 'Performance'].map((title) => (
              <div key={title} className="rounded border border-stone-200 bg-white p-3">
                <div className="text-xs font-semibold text-stone-900 mb-2">{title}</div>
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20" />
                        <div className="h-2 w-20 rounded bg-stone-200" />
                      </div>
                      <div className="font-mono tabular-nums text-emerald-700 font-semibold">
                        {Math.round(40 + Math.random() * 50)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Big movers — wider rows */}
          <div className="rounded border border-stone-200 bg-white p-3">
            <div className="text-xs font-semibold text-stone-900 mb-2">
              Biggest Movers
            </div>
            <div className="space-y-1.5">
              {ROWS.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 items-center text-[11px] py-1.5 border-b border-stone-100 last:border-b-0"
                >
                  <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-base">
                    {r.sym}
                  </div>
                  <div className="text-stone-800 truncate">{r.q}</div>
                  <div className="font-mono tabular-nums font-semibold text-stone-900">
                    {r.pct}
                  </div>
                  <div
                    className={`font-mono tabular-nums text-[10px] ${
                      r.delta.startsWith('+') ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {r.delta.startsWith('+') ? '▲' : '▼'} {r.delta.replace(/[+−]/, '')}
                  </div>
                  <div className="font-mono tabular-nums text-stone-600">{r.vol}</div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Right sidebar — O'Toole */}
        <aside className="border-l border-stone-200 bg-white p-3 space-y-3">
          <div className="text-xs font-semibold text-stone-900">O&apos;Toole</div>
          <div className="rounded bg-stone-100 p-3 text-[11px] text-stone-700">
            Looking at 14 markets that moved &gt;5pp in the last hour. Want a quick
            breakdown?
          </div>
          <div className="rounded bg-emerald-100 p-3 text-[11px] text-emerald-900 ml-6">
            Yeah, top 3.
          </div>
          <div className="space-y-1.5 pt-2">
            <div className="h-2 rounded bg-stone-200 w-full" />
            <div className="h-2 rounded bg-stone-200 w-5/6" />
            <div className="h-2 rounded bg-stone-200 w-4/6" />
          </div>
        </aside>
      </div>
    </div>
  )
}
