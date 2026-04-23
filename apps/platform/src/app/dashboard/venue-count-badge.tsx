/**
 * Small green pill that surfaces "this market is quoted on N books." Only
 * renders when count >= 2 — singletons are the common case and don't need
 * extra visual noise.
 */
export function VenueCountBadge({ count }: { count: number | undefined }) {
  if (!count || count < 2) return null
  return (
    <span
      className="inline-flex items-center rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 ring-1 ring-emerald-300 text-[9px] font-semibold tracking-wider flex-shrink-0"
      title={`Quoted on ${count} books`}
    >
      {count}×
    </span>
  )
}
