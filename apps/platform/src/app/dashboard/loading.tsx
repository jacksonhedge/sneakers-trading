// Instant skeleton on /dashboard nav. Without this, the whole page waits
// on the heavy parallel loads (markets + history + canonical) before
// rendering anything — feels like a broken click. Now the topbar shell +
// shimmer cards appear immediately and the real data swaps in.

export default function DashboardLoading() {
  return (
    <div className="h-screen overflow-hidden bg-stone-50 text-stone-900 flex flex-col">
      <div className="h-[56px] border-b border-stone-200 bg-white flex items-center px-4 gap-3">
        <div className="w-7 h-7 rounded-full bg-stone-200 animate-pulse" />
        <div className="h-4 w-40 rounded bg-stone-200 animate-pulse" />
        <div className="ml-auto flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-stone-200 animate-pulse" />
          <div className="w-9 h-9 rounded-lg bg-stone-200 animate-pulse" />
          <div className="w-9 h-9 rounded-lg bg-stone-200 animate-pulse" />
          <div className="w-8 h-8 rounded-full bg-stone-200 animate-pulse" />
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <aside className="w-[380px] shrink-0 bg-white border-r border-stone-200 p-6 space-y-4">
          <div className="h-4 w-24 bg-stone-200 rounded animate-pulse" />
          <div className="h-3 w-full bg-stone-100 rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-stone-100 rounded animate-pulse" />
          <div className="h-3 w-5/6 bg-stone-100 rounded animate-pulse" />
        </aside>

        <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-w-0">
          <div className="h-20 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
          <div className="h-32 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="h-64 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
            <div className="h-64 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
            <div className="h-64 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
          </div>
          <div className="h-48 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
        </main>
      </div>
    </div>
  )
}
