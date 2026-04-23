import { Fragment } from 'react'
import { VENUES } from '@/lib/venues'

// User-defined priority for the head of the ticker. Brands with both a
// prediction-market AND a sportsbook surface (Fanatics, DK, FD) appear as
// back-to-back pairs.
const PRIORITY_ORDER = [
  'kalshi',
  'polymarket',
  'fanatics_predicts',
  'fanatics_sb',
  'novig',
  'prophetx',
  'sporttrade',
  'metamask_predictions',
  'dk_predictions',
  'draftkings_sb',
  'fanduel_predicts',
  'fanduel_sb',
  'bet365',
]

function buildOrder(): string[] {
  const allowed = VENUES.filter((v) => v.category !== 'sweeps_social')
  const priorityIds = new Set(PRIORITY_ORDER)

  const head: string[] = []
  for (const id of PRIORITY_ORDER) {
    const v = allowed.find((x) => x.id === id)
    if (v) head.push(v.name)
  }

  const rest = allowed
    .filter((v) => !priorityIds.has(v.id))
    .map((v) => v.name)
    .sort((a, b) => a.localeCompare(b))

  return [...head, ...rest]
}

export function VenueTicker() {
  const items = buildOrder()
  // Duplicate the track so translateX(-50%) yields a seamless loop.
  const looped = [...items, ...items]

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 overflow-hidden bg-black/55 backdrop-blur-sm border-t border-white/10 py-4">
      <div className="text-[10px] text-white/50 tracking-[0.2em] text-center mb-2">
        TRACKING ACROSS
      </div>
      <div className="flex items-center gap-6 animate-ticker-marquee whitespace-nowrap will-change-transform font-mono text-sm">
        {looped.map((name, i) => (
          <Fragment key={`${name}-${i}`}>
            <span className="uppercase tracking-[0.18em] text-emerald-300/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
              {name}
            </span>
            <span className="text-white/25 select-none" aria-hidden>
              ·
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
