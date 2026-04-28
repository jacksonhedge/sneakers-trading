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

// Registry of known logo assets. Most live under /SneakersLogos/partners/
// (same set the top-nav AppsBar uses). Older /logos/ assets retained as
// overrides where the partner asset hasn't been ported.
const LOGOS: Record<string, LogoEntry> = {
  polymarket: { src: '/SneakersLogos/partners/polymarket.png', color: '#1652F0' },
  kalshi: { src: '/SneakersLogos/partners/kalshi.png', color: '#00C07E' },
  novig: { src: '/SneakersLogos/partners/novig.png', color: '#F59E0B' },
  prophetx: { src: '/SneakersLogos/partners/prophetx.png', color: '#7C3AED' },
  og: { src: '/SneakersLogos/partners/og.png', color: '#E11D48' },
  og_markets: { src: '/SneakersLogos/partners/og.png', color: '#E11D48' },
  limitless: { src: '/SneakersLogos/partners/limitless.svg', color: '#111827' },
  opinion: { src: '/SneakersLogos/partners/opinion.svg', color: '#FF5E00' },
  gemini: { src: '/SneakersLogos/partners/gemini.svg', color: '#0EA5E9' },
  underdog: { src: '/SneakersLogos/partners/underdog.png', color: '#111827' },
  prizepicks: { src: '/SneakersLogos/partners/prizepicks.png', color: '#6D28D9' },
  prizepicks_predictions: {
    src: '/SneakersLogos/partners/prizepicks_predictions.png',
    color: '#6D28D9',
  },
  fanduel_predicts: {
    src: '/SneakersLogos/partners/fanduel_predicts.png',
    color: '#1493FF',
  },
  fanduel_sb: { src: '/SneakersLogos/partners/fanduel_sb.png', color: '#1493FF' },
  draftkings_sb: {
    src: '/SneakersLogos/partners/draftkings_sb.png',
    color: '#53D337',
  },
  dk_predictions: {
    src: '/SneakersLogos/partners/dk_predictions.png',
    color: '#53D337',
  },
  fanatics_predicts: {
    src: '/SneakersLogos/partners/fanatics_predicts.png',
    color: '#000000',
  },
  coinbase_predict: {
    src: '/SneakersLogos/partners/coinbase_predict.png',
    color: '#0052FF',
  },
  robinhood_events: {
    src: '/SneakersLogos/partners/robinhood_events.png',
    color: '#00C805',
  },
  sleeper_picks: {
    src: '/SneakersLogos/partners/sleeper_picks.png',
    color: '#2DD4BF',
  },
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
const SIZE_PX: Record<Size, number> = { xs: 18, sm: 30, md: 40, lg: 56 }
const SIZE_CLS: Record<Size, string> = {
  xs: 'w-[18px] h-[18px] text-[8px]',
  sm: 'w-[30px] h-[30px] text-[11px]',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
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

  // Logos at xs are unreadable — always use the letter badge at 18px.
  if (logo && size !== 'xs') {
    return (
      <div className={`${containerCls} bg-white`}>
        <Image
          src={logo.src}
          alt={platform}
          width={SIZE_PX[size] * 2}
          height={SIZE_PX[size] * 2}
          className="w-full h-full object-cover"
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
