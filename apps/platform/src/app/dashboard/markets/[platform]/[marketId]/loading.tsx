// Instant skeleton on market-detail nav. The page does a 100K-row
// loadMarkets + loadMarketHistory on the server — that's the lag the user
// feels when clicking a market. Until we narrow that query, this skeleton
// at least makes the click feel responsive.

export default function MarketDetailLoading() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col">
      <div className="h-[52px] border-b border-stone-200 bg-white flex items-center px-4 gap-3">
        <div className="w-6 h-6 rounded-full bg-stone-200 animate-pulse" />
        <div className="h-3 w-48 bg-stone-200 rounded animate-pulse" />
      </div>
      <div className="px-4 py-2 border-b border-stone-200 bg-white">
        <div className="h-3 w-72 bg-stone-100 rounded animate-pulse" />
      </div>
      <div className="flex-1 flex min-w-0">
        <aside className="w-[280px] shrink-0 border-r border-stone-200 bg-white p-4 space-y-3">
          <div className="h-3 w-20 bg-stone-200 rounded animate-pulse" />
          <div className="h-4 w-40 bg-stone-200 rounded animate-pulse" />
          <div className="h-3 w-56 bg-stone-100 rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-2 pt-3">
            <div className="h-14 rounded bg-stone-100 animate-pulse" />
            <div className="h-14 rounded bg-stone-100 animate-pulse" />
            <div className="h-14 rounded bg-stone-100 animate-pulse" />
            <div className="h-14 rounded bg-stone-100 animate-pulse" />
          </div>
        </aside>
        <main className="flex-1 px-6 py-5 space-y-4 min-w-0">
          <div className="h-72 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
          <div className="h-40 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
        </main>
      </div>
    </div>
  )
}
