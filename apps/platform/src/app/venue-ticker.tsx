import Image from 'next/image'
import { VENUES } from '@/lib/venues'

// Logos that exist at /public/SneakersLogos/partners/<id>.png. When a new PNG
// lands, add the id here and the ticker will switch from text-fallback to
// the image automatically. Keep this in sync with the directory.
const LOGO_AVAILABLE = new Set([
  'kalshi',
  'polymarket',
  'novig',
  'prophetx',
  'fanatics_predicts',
  'fanduel_sb',
  'fanduel_predicts',
  'draftkings_sb',
  'dk_predictions',
  'prizepicks',
  'prizepicks_predictions',
  'underdog',
  'sleeper_picks',
  'coinbase_predict',
  'robinhood_events',
])

// User-defined priority for the head of the ticker. Anything not listed here
// follows alphabetically.
const PRIORITY_ORDER = [
  'kalshi',
  'polymarket',
  'fanatics_predicts',
  'novig',
  'prophetx',
  'sporttrade',
  'metamask_predictions',
]

type Item = { id: string; name: string }

function buildOrder(): Item[] {
  const allowed = VENUES.filter((v) => v.category !== 'sweeps_social')
  const priorityIds = new Set(PRIORITY_ORDER)

  const head: Item[] = []
  for (const id of PRIORITY_ORDER) {
    const v = allowed.find((x) => x.id === id)
    if (v) head.push({ id: v.id, name: v.name })
  }

  const rest = allowed
    .filter((v) => !priorityIds.has(v.id))
    .map((v) => ({ id: v.id, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return [...head, ...rest]
}

function VenueIcon({ id, name }: Item) {
  const hasLogo = LOGO_AVAILABLE.has(id)
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  return (
    <div
      className="flex-shrink-0 flex flex-col items-center gap-1.5"
      title={name}
    >
      <div className="w-14 h-14 rounded-2xl bg-white ring-1 ring-stone-200/60 shadow-[0_4px_12px_rgba(0,0,0,0.25)] flex items-center justify-center overflow-hidden">
        {hasLogo ? (
          <Image
            src={`/SneakersLogos/partners/${id}.png`}
            alt={name}
            width={56}
            height={56}
            className="w-full h-full object-contain p-1.5"
          />
        ) : (
          <span className="text-stone-700 text-[11px] font-bold tracking-tight">
            {initials || '·'}
          </span>
        )}
      </div>
      <span className="text-[10px] text-white/70 tracking-wide max-w-[68px] truncate">
        {name}
      </span>
    </div>
  )
}

export function VenueTicker() {
  const items = buildOrder()
  // Duplicate the track so translateX(-50%) yields a seamless loop.
  const looped = [...items, ...items]

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 overflow-hidden bg-black/55 backdrop-blur-sm border-t border-white/10 py-3">
      <div className="text-[10px] text-white/50 tracking-[0.2em] text-center mb-2">
        TRACKING ACROSS
      </div>
      <div className="flex gap-5 animate-ticker-marquee whitespace-nowrap will-change-transform">
        {looped.map((item, i) => (
          <VenueIcon key={`${item.id}-${i}`} id={item.id} name={item.name} />
        ))}
      </div>
    </div>
  )
}
