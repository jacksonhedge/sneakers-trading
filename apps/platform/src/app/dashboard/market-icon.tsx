import type { MarketSnapshot } from '@/lib/markets-data'

type Shape = {
  symbol: string
  bg: string
  text: string
  ring: string
}

function sportFromTags(m: MarketSnapshot): string | null {
  const tags = (m.tags ?? []).map((t) => t.toLowerCase())
  if (tags.some((t) => t === 'basketball' || t === 'nba')) return 'basketball'
  if (tags.some((t) => t === 'baseball' || t === 'mlb')) return 'baseball'
  if (tags.some((t) => t === 'football' || t === 'nfl' || t === 'cfb')) return 'football'
  if (tags.some((t) => t === 'ice_hockey' || t === 'hockey' || t === 'nhl')) return 'hockey'
  if (tags.some((t) => t === 'soccer' || t === 'football_eu' || t === 'mls')) return 'soccer'
  if (tags.some((t) => t === 'tennis')) return 'tennis'
  if (tags.some((t) => t === 'mma' || t === 'ufc' || t === 'boxing')) return 'mma'
  if (m.sport) return m.sport.toLowerCase()
  return null
}

function topicFromQuestion(q: string): { symbol: string; bg: string; text: string; ring: string } | null {
  const lower = q.toLowerCase()
  if (/\bbtc\b|bitcoin/.test(lower)) {
    return { symbol: '₿', bg: 'bg-orange-500/15', text: 'text-orange-700', ring: 'ring-orange-400/50' }
  }
  if (/\beth\b|ethereum/.test(lower)) {
    return { symbol: 'Ξ', bg: 'bg-indigo-500/15', text: 'text-indigo-700', ring: 'ring-indigo-400/50' }
  }
  if (/\bsol\b|solana/.test(lower)) {
    return { symbol: '◎', bg: 'bg-violet-500/15', text: 'text-violet-700', ring: 'ring-violet-400/50' }
  }
  if (/fed|rates?|fomc|inflation|cpi|unemployment/.test(lower)) {
    return { symbol: '📊', bg: 'bg-blue-500/15', text: 'text-blue-700', ring: 'ring-blue-400/50' }
  }
  if (/election|senate|house|president|congress|dem(ocrat)?|rep(ublican)?/.test(lower)) {
    return { symbol: '🗳️', bg: 'bg-rose-500/15', text: 'text-rose-700', ring: 'ring-rose-400/50' }
  }
  if (/apple|tesla|nvidia|google|microsoft|meta|amazon|earnings/.test(lower)) {
    return { symbol: '📈', bg: 'bg-emerald-500/15', text: 'text-emerald-700', ring: 'ring-emerald-400/50' }
  }
  return null
}

function shapeFor(m: MarketSnapshot): Shape {
  const sport = sportFromTags(m)
  if (sport) {
    const SPORT_SHAPES: Record<string, Shape> = {
      basketball: { symbol: '🏀', bg: 'bg-orange-500/15', text: 'text-orange-700', ring: 'ring-orange-400/50' },
      baseball: { symbol: '⚾', bg: 'bg-red-500/10', text: 'text-red-700', ring: 'ring-red-400/40' },
      football: { symbol: '🏈', bg: 'bg-amber-700/15', text: 'text-amber-900', ring: 'ring-amber-600/40' },
      hockey: { symbol: '🏒', bg: 'bg-slate-500/15', text: 'text-slate-700', ring: 'ring-slate-400/50' },
      soccer: { symbol: '⚽', bg: 'bg-green-500/15', text: 'text-green-700', ring: 'ring-green-400/50' },
      tennis: { symbol: '🎾', bg: 'bg-lime-500/15', text: 'text-lime-700', ring: 'ring-lime-400/50' },
      mma: { symbol: '🥊', bg: 'bg-red-600/15', text: 'text-red-800', ring: 'ring-red-500/50' },
    }
    if (SPORT_SHAPES[sport]) return SPORT_SHAPES[sport]
  }

  const topic = topicFromQuestion(m.question)
  if (topic) return topic

  return {
    symbol: '◉',
    bg: 'bg-stone-500/10',
    text: 'text-stone-600',
    ring: 'ring-stone-300/80',
  }
}

function platformCorner(platform: string): { letter: string; cls: string } {
  const p = platform.toLowerCase()
  if (p === 'kalshi') return { letter: 'K', cls: 'bg-emerald-600 text-white' }
  if (p === 'polymarket') return { letter: 'P', cls: 'bg-sky-600 text-white' }
  if (p === 'novig') return { letter: 'N', cls: 'bg-amber-600 text-white' }
  if (p === 'prophetx') return { letter: 'X', cls: 'bg-violet-600 text-white' }
  if (p === 'og') return { letter: 'O', cls: 'bg-rose-600 text-white' }
  if (p === 'oddsapi') return { letter: '⚡', cls: 'bg-indigo-600 text-white' }
  if (p === 'fanduel') return { letter: 'F', cls: 'bg-blue-600 text-white' }
  if (p === 'draftkings') return { letter: 'D', cls: 'bg-green-700 text-white' }
  if (p === 'betmgm') return { letter: 'M', cls: 'bg-yellow-600 text-white' }
  if (p === 'betrivers') return { letter: 'R', cls: 'bg-sky-700 text-white' }
  return { letter: platform[0].toUpperCase(), cls: 'bg-stone-600 text-white' }
}

export function MarketIcon({
  market,
  size = 32,
}: {
  market: MarketSnapshot
  size?: 24 | 32 | 40
}) {
  const shape = shapeFor(market)
  const corner = platformCorner(market.platform)
  const sizeCls = size === 24 ? 'w-6 h-6 text-[12px]' : size === 40 ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-sm'
  const cornerSize = size === 24 ? 'w-3 h-3 text-[7px]' : size === 40 ? 'w-4 h-4 text-[9px]' : 'w-3.5 h-3.5 text-[8px]'

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sizeCls} rounded-full flex items-center justify-center ring-1 ${shape.bg} ${shape.text} ${shape.ring}`}
      >
        <span className="leading-none">{shape.symbol}</span>
      </div>
      <div
        className={`${cornerSize} ${corner.cls} absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center font-bold ring-2 ring-white`}
        aria-hidden
      >
        {corner.letter}
      </div>
    </div>
  )
}
