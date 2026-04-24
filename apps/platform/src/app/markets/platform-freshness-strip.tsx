import type { BookFreshness } from '@/lib/markets-data'

// Freshness colors: green <10 min, amber 10-30 min, red >30 min. Matches the
// stale-skew threshold the arb scanner uses so a user looking at a red chip
// knows their arbs on that book are being dropped by the scanner.

type Level = 'fresh' | 'warn' | 'stale' | 'unknown'

function ageOf(latestTs: string | null): { label: string; level: Level } {
  if (!latestTs) return { label: '—', level: 'unknown' }
  const ms = Date.now() - new Date(latestTs).getTime()
  if (!Number.isFinite(ms) || ms < 0) return { label: '—', level: 'unknown' }
  const min = Math.floor(ms / 60_000)
  if (min < 1) return { label: 'now', level: 'fresh' }
  if (min < 60) {
    return {
      label: `${min}m ago`,
      level: min < 10 ? 'fresh' : min < 30 ? 'warn' : 'stale',
    }
  }
  const hr = Math.floor(min / 60)
  if (hr < 24) return { label: `${hr}h ago`, level: 'stale' }
  return { label: `${Math.floor(hr / 24)}d ago`, level: 'stale' }
}

const LEVEL_CLS: Record<Level, string> = {
  fresh: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
  warn: 'bg-amber-50 text-amber-700 ring-amber-300',
  stale: 'bg-rose-50 text-rose-700 ring-rose-300',
  unknown: 'bg-stone-100 text-stone-500 ring-stone-300',
}

export function PlatformFreshnessStrip({
  perBook,
}: {
  perBook: Record<string, BookFreshness>
}) {
  const entries = Object.entries(perBook)
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)

  if (entries.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-[10px] text-stone-500 tracking-wider pr-1">DATA</span>
      {entries.map(([platform, info]) => {
        const { label, level } = ageOf(info.latestTs)
        return (
          <span
            key={platform}
            className={`text-[10px] tracking-wider px-2 py-0.5 rounded-full ring-1 ${LEVEL_CLS[level]}`}
            title={
              info.latestTs
                ? `${info.count.toLocaleString()} markets · latest ${info.latestTs}`
                : `${info.count.toLocaleString()} markets · no timestamp`
            }
          >
            {platform}
            <span className="text-stone-500 mx-1">·</span>
            {label}
          </span>
        )
      })}
    </div>
  )
}
