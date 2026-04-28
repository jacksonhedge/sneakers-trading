// Skeleton for the right-hand content slot. The dashboard layout provides
// the topbar + OToole panel chrome on every /dashboard/* route, so this
// only needs to fill the main column while the home page's heavy data
// loads (markets + history + canonical grouping) resolve.

export default function DashboardLoading() {
  return (
    <div className="px-6 py-5 space-y-5">
      <div className="h-20 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
      <div className="h-32 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="h-64 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
        <div className="h-64 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
        <div className="h-64 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
      </div>
      <div className="h-48 rounded-xl bg-white ring-1 ring-stone-200 animate-pulse" />
    </div>
  )
}
