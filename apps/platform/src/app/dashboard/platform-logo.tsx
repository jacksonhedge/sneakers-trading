import Image from 'next/image'

// Platform logo with graceful fallback. When we have a brand asset in
// public/logos/ we render it; otherwise we render a colored letter badge
// using the platform's brand color. This lets us incrementally add logos
// without breaking rows that don't yet have one.

type LogoEntry = {
  src: string
  // Brand color — used as ring/background tint behind the logo, and as the
  // fallback badge color if we ever strip the asset.
  color: string
}

// Registry of known logo assets. Add entries here as logos land in
// public/logos/. The key matches the platform id that scrapers emit.
const LOGOS: Record<string, LogoEntry> = {
  polymarket: { src: '/logos/polymarket.png', color: '#1652F0' },
  kalshi: { src: '/logos/kalshi.png', color: '#00C07E' },
  opinion: { src: '/logos/opinion.jpeg', color: '#FF5E00' },
}

// Fallback letter-badge colors. When no logo asset is present, we render a
// colored circle with the first letter — one color per platform id so
// rows remain visually distinguishable.
const FALLBACK_COLORS: Record<string, string> = {
  novig: '#F59E0B',
  prophetx: '#7C3AED',
  og: '#E11D48',
  og_markets: '#E11D48',
  oddsapi: '#4F46E5',
  fanduel: '#1493FF',
  fanduel_sb: '#1493FF',
  fanduel_predicts: '#1493FF',
  draftkings: '#53D337',
  draftkings_sb: '#53D337',
  dk_predictions: '#53D337',
  dk_pick6: '#53D337',
  betmgm: '#C49A3B',
  betrivers: '#0EA5E9',
  bet365: '#14834B',
  caesars: '#B8860B',
  espn_bet: '#D32F2F',
  pointsbet_us: '#E11D48',
  hard_rock_bet: '#111827',
  bally_bet: '#DC2626',
  prizepicks: '#6D28D9',
  prizepicks_predictions: '#6D28D9',
  underdog: '#111827',
  sleeper_picks: '#2DD4BF',
  sleeper_markets: '#2DD4BF',
  betr_picks: '#F97316',
  parlayplay: '#0891B2',
  thrillz: '#22C55E',
  fliff: '#3B82F6',
  stake_us: '#1FD15F',
  rebet: '#0EA5E9',
  mcluck: '#F59E0B',
  high5: '#DC2626',
  pulsz: '#F59E0B',
  sporttrade: '#0EA5E9',
  limitless: '#111827',
  cdna: '#003CDA',
  coinbase_predict: '#0052FF',
  robinhood_events: '#00C805',
  metamask_predictions: '#F6851B',
  fanatics_predicts: '#000000',
  fanatics_sb: '#000000',
}

function colorFor(platform: string): string {
  const p = platform.toLowerCase()
  return LOGOS[p]?.color ?? FALLBACK_COLORS[p] ?? '#57534E'
}

type Size = 'xs' | 'sm' | 'md' | 'lg'
const SIZE_PX: Record<Size, number> = { xs: 16, sm: 22, md: 32, lg: 48 }
const SIZE_CLS: Record<Size, string> = {
  xs: 'w-4 h-4 text-[8px]',
  sm: 'w-[22px] h-[22px] text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-12 h-12 text-base',
}

export function PlatformLogo({
  platform,
  size = 'sm',
  rounded = 'full',
}: {
  platform: string
  size?: Size
  rounded?: 'full' | 'md'
}) {
  const key = platform.toLowerCase()
  const logo = LOGOS[key]
  const roundCls = rounded === 'full' ? 'rounded-full' : 'rounded-md'
  const containerCls = `${SIZE_CLS[size]} ${roundCls} overflow-hidden flex items-center justify-center flex-shrink-0`

  // Logos at xs are unreadable — always use the letter badge at 16px.
  if (logo && size !== 'xs') {
    return (
      <div className={`${containerCls} ring-1 ring-stone-200 bg-white`}>
        <Image
          src={logo.src}
          alt={platform}
          width={SIZE_PX[size] * 2}
          height={SIZE_PX[size] * 2}
          className="w-full h-full object-contain"
        />
      </div>
    )
  }

  // Fallback: colored circle with first letter.
  const letter = platform[0]?.toUpperCase() ?? '?'
  return (
    <div
      className={`${containerCls} text-white font-bold`}
      style={{ backgroundColor: colorFor(key) }}
      aria-label={platform}
    >
      {letter}
    </div>
  )
}
