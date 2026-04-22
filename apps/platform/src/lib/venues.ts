export type VenueCategory =
  | 'prediction_market'
  | 'sportsbook'
  | 'dfs_pickem'
  | 'sweeps_social'

export type VenueStatus = 'live' | 'coming_soon' | 'requested_frequently'

export interface Venue {
  id: string
  name: string
  category: VenueCategory
  status: VenueStatus
  logo?: string
  blurb: string
  affiliateUrl?: string
  /**
   * `wrapperOf: "kalshi"` signals that this venue surfaces Kalshi's contracts
   * verbatim. UI can show them alongside Kalshi as distinct trade destinations
   * (for affiliate revenue) while the arb scanner treats them as one price.
   */
  wrapperOf?: string
}

export const CATEGORY_LABELS: Record<VenueCategory, string> = {
  prediction_market: 'Prediction Markets',
  sportsbook: 'Sportsbooks',
  dfs_pickem: 'DFS / Pick’em',
  sweeps_social: 'Sweeps & Social',
}

/**
 * Canonical list of every venue Sneakers tracks or intends to track.
 * Status values:
 *   - `live`: actively scraped, data flowing
 *   - `coming_soon`: scraper work in flight or cURL captured, pending integration
 *   - `requested_frequently`: not scraped yet; "Request early access" signals demand
 */
export const VENUES: Venue[] = [
  // ── Prediction markets (independent books) ─────────────────────────────
  {
    id: 'polymarket',
    name: 'Polymarket',
    category: 'prediction_market',
    status: 'live',
    blurb: 'On-chain binary contracts across sports, crypto, politics, culture.',
    affiliateUrl: 'https://polymarket.com',
  },
  {
    id: 'kalshi',
    name: 'Kalshi',
    category: 'prediction_market',
    status: 'live',
    blurb: 'CFTC-regulated event contracts across 10+ categories.',
    affiliateUrl: 'https://kalshi.com',
  },
  {
    id: 'prophetx',
    name: 'ProphetX',
    category: 'prediction_market',
    status: 'live',
    blurb: 'Peer-to-peer exchange with L3 orderbook depth.',
    affiliateUrl: 'https://www.prophetx.co',
  },
  {
    id: 'novig',
    name: 'NoVig',
    category: 'prediction_market',
    status: 'live',
    blurb: 'Zero-vig P2P orderbook. Closest thing to fair probability.',
    affiliateUrl: 'https://novig.onelink.me/JHQQ/z4rs67t7',
  },
  {
    id: 'dk_predictions',
    name: 'DraftKings Predictions',
    category: 'prediction_market',
    status: 'coming_soon',
    blurb: 'CFTC-licensed binary event contracts from DraftKings.',
  },
  {
    id: 'fanduel_predicts',
    name: 'FanDuel Predicts',
    category: 'prediction_market',
    status: 'coming_soon',
    blurb: 'FanDuel’s dedicated prediction-market product.',
  },
  {
    id: 'prizepicks_predictions',
    name: 'PrizePicks Predictions',
    category: 'prediction_market',
    status: 'coming_soon',
    blurb: 'Team Picks and Culture Picks binary markets.',
  },
  {
    id: 'cdna',
    name: 'Crypto.com Derivatives (CDNA)',
    category: 'prediction_market',
    status: 'coming_soon',
    blurb: 'CFTC-registered exchange powering Underdog Predict.',
  },
  {
    id: 'fanatics_predicts',
    name: 'Fanatics Predicts',
    category: 'prediction_market',
    status: 'requested_frequently',
    blurb: 'Fanatics’ rumored prediction-market product.',
  },
  {
    id: 'sporttrade',
    name: 'Sporttrade',
    category: 'prediction_market',
    status: 'requested_frequently',
    blurb: 'CFTC-regulated sports prediction exchange.',
  },

  // ── Kalshi wrappers (same underlying prices, separate trade destinations)
  {
    id: 'coinbase_predict',
    name: 'Coinbase Predict',
    category: 'prediction_market',
    status: 'live',
    wrapperOf: 'kalshi',
    blurb: 'Kalshi contracts surfaced inside Coinbase.',
    affiliateUrl: 'https://www.coinbase.com/predictions',
  },
  {
    id: 'sleeper_markets',
    name: 'Sleeper Markets',
    category: 'prediction_market',
    status: 'live',
    wrapperOf: 'kalshi',
    blurb: 'Kalshi contracts inside the Sleeper fantasy app.',
    affiliateUrl: 'http://sleeper.com/promo/WINDAILYSPORTS',
  },
  {
    id: 'robinhood_events',
    name: 'Robinhood',
    category: 'prediction_market',
    status: 'live',
    wrapperOf: 'kalshi',
    blurb: 'Kalshi event contracts inside Robinhood.',
    affiliateUrl: 'https://robinhood.com/prediction-markets',
  },
  {
    id: 'metamask_predictions',
    name: 'MetaMask',
    category: 'prediction_market',
    status: 'live',
    wrapperOf: 'polymarket',
    blurb: 'Polymarket contracts surfaced inside MetaMask Portfolio.',
    affiliateUrl: 'https://portfolio.metamask.io/predict',
  },

  // ── Sportsbooks ─────────────────────────────────────────────────────────
  {
    id: 'draftkings_sb',
    name: 'DraftKings Sportsbook',
    category: 'sportsbook',
    status: 'coming_soon',
    blurb: 'America’s largest online sportsbook.',
    affiliateUrl: 'https://dksb.sng.link/As9kz/2jt4',
  },
  {
    id: 'fanduel_sb',
    name: 'FanDuel Sportsbook',
    category: 'sportsbook',
    status: 'coming_soon',
    blurb: 'Second-largest US sportsbook.',
    affiliateUrl: 'https://wlfanduelus.adsrv.eacdn.com/C.ashx?btag=a_43881b_96c_&affid=5594',
  },
  {
    id: 'fanatics_sb',
    name: 'Fanatics Sportsbook',
    category: 'sportsbook',
    status: 'coming_soon',
    blurb: 'Fanatics’ sportsbook (non-NY).',
    affiliateUrl: 'https://track.fanaticsbettingpartners.com/track/c22adfd7-c807-482b-9203-764f5685659f?type=seo&s1=662608039',
  },
  {
    id: 'betmgm',
    name: 'BetMGM',
    category: 'sportsbook',
    status: 'requested_frequently',
    blurb: 'Major US sportsbook operator.',
  },
  {
    id: 'caesars',
    name: 'Caesars Sportsbook',
    category: 'sportsbook',
    status: 'requested_frequently',
    blurb: 'Caesars Entertainment’s sportsbook.',
  },
  {
    id: 'espn_bet',
    name: 'theScore Bet',
    category: 'sportsbook',
    status: 'requested_frequently',
    blurb: 'Penn Entertainment sportsbook. Rebranded from ESPN BET 2025-12-01.',
  },
  {
    id: 'betrivers',
    name: 'BetRivers',
    category: 'sportsbook',
    status: 'requested_frequently',
    blurb: 'Rush Street Interactive sportsbook.',
  },
  {
    id: 'hard_rock_bet',
    name: 'Hard Rock Bet',
    category: 'sportsbook',
    status: 'requested_frequently',
    blurb: 'Hard Rock Digital sportsbook.',
  },
  {
    id: 'bally_bet',
    name: 'Bally Bet',
    category: 'sportsbook',
    status: 'requested_frequently',
    blurb: 'Bally’s Interactive sportsbook.',
  },
  {
    id: 'bet365',
    name: 'bet365',
    category: 'sportsbook',
    status: 'requested_frequently',
    blurb: 'Global sportsbook operator.',
  },

  // ── DFS / Pick’em ──────────────────────────────────────────────────────
  {
    id: 'prizepicks',
    name: 'PrizePicks',
    category: 'dfs_pickem',
    status: 'coming_soon',
    blurb: 'America’s #1 DFS pick’em app.',
    affiliateUrl: 'https://app.prizepicks.com/sign-up?invite_code=WINDAILY',
  },
  {
    id: 'underdog',
    name: 'Underdog Fantasy',
    category: 'dfs_pickem',
    status: 'coming_soon',
    blurb: 'DFS pick’em and prediction markets in one app.',
    affiliateUrl: 'https://play.underdogfantasy.com/p-win-daily-sports',
  },
  {
    id: 'sleeper_picks',
    name: 'Sleeper Picks',
    category: 'dfs_pickem',
    status: 'coming_soon',
    blurb: 'Fantasy-style pick’em in the Sleeper app.',
    affiliateUrl: 'http://sleeper.com/promo/WINDAILYSPORTS',
  },
  {
    id: 'betr_picks',
    name: 'Betr Picks',
    category: 'dfs_pickem',
    status: 'requested_frequently',
    blurb: 'Pick’em from Jake Paul’s Betr. Mobile-first.',
    affiliateUrl: 'https://engagebetr.onelink.me/auSX/windailysports',
  },
  {
    id: 'parlayplay',
    name: 'ParlayPlay',
    category: 'dfs_pickem',
    status: 'requested_frequently',
    blurb: 'DFS pick’em operator.',
  },
  {
    id: 'dk_pick6',
    name: 'DraftKings Pick 6',
    category: 'dfs_pickem',
    status: 'requested_frequently',
    blurb: 'DraftKings’ pick’em product.',
  },

  // ── Sweeps / Social sportsbooks ────────────────────────────────────────
  {
    id: 'thrillz',
    name: 'Thrillz',
    category: 'sweeps_social',
    status: 'coming_soon',
    blurb: 'Sweeps-style sportsbook.',
    affiliateUrl: 'https://thrillzz.sng.link/Eyrva/552q?pcn=WINDAILY',
  },
  {
    id: 'og_markets',
    name: 'OG Markets',
    category: 'prediction_market',
    status: 'live',
    blurb:
      'CFTC-regulated binary contracts on the CDNA/Nadex stack. Deep crypto + forex coverage plus sports.',
    affiliateUrl: 'https://ogmarketslimited.pxf.io/c/5479135/3751434/47438',
  },
  {
    id: 'fliff',
    name: 'Fliff',
    category: 'sweeps_social',
    status: 'requested_frequently',
    blurb: 'Social sportsbook with sweeps mechanics.',
  },
  {
    id: 'stake_us',
    name: 'Stake.us',
    category: 'sweeps_social',
    status: 'requested_frequently',
    blurb: 'Stake’s US sweeps product.',
  },
  {
    id: 'rebet',
    name: 'Rebet',
    category: 'sweeps_social',
    status: 'requested_frequently',
    blurb: 'Social betting exchange.',
  },
  {
    id: 'mcluck',
    name: 'McLuck',
    category: 'sweeps_social',
    status: 'requested_frequently',
    blurb: 'Sweeps-style casino/sportsbook.',
  },
  {
    id: 'high5',
    name: 'High 5 Casino',
    category: 'sweeps_social',
    status: 'requested_frequently',
    blurb: 'Sweeps casino expanding into sports.',
  },
  {
    id: 'pulsz',
    name: 'Pulsz',
    category: 'sweeps_social',
    status: 'requested_frequently',
    blurb: 'Sweeps casino operator.',
  },
]

export function venuesByCategory(): Record<VenueCategory, Venue[]> {
  const out: Record<VenueCategory, Venue[]> = {
    prediction_market: [],
    sportsbook: [],
    dfs_pickem: [],
    sweeps_social: [],
  }
  for (const v of VENUES) out[v.category].push(v)
  return out
}

export function findVenue(id: string): Venue | undefined {
  return VENUES.find((v) => v.id === id)
}
