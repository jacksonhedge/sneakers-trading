// Normalize raw scraper-emitted sport ids ("ICE_HOCKEY", "basketball",
// "mma", etc.) to a single display string. Used everywhere a market or
// filter chip surfaces a sport so the UI doesn't leak SCREAMING_SNAKE.

const SPORT_DISPLAY: Record<string, string> = {
  // Common nouns — title case.
  BASKETBALL: 'Basketball',
  BASEBALL: 'Baseball',
  FOOTBALL: 'Football',
  HOCKEY: 'Hockey',
  ICE_HOCKEY: 'Hockey',
  ICEHOCKEY: 'Hockey',
  SOCCER: 'Soccer',
  TENNIS: 'Tennis',
  GOLF: 'Golf',
  CRICKET: 'Cricket',
  RUGBY: 'Rugby',
  ESPORTS: 'Esports',
  BOXING: 'Boxing',
  // Abbreviations — keep as-is (and uppercase for canonical form).
  NBA: 'NBA',
  WNBA: 'WNBA',
  NCAAB: 'NCAAB',
  CBB: 'NCAAB',
  NFL: 'NFL',
  NCAAF: 'NCAAF',
  CFB: 'NCAAF',
  MLB: 'MLB',
  NHL: 'Hockey',
  MLS: 'Soccer',
  EPL: 'EPL',
  LALIGA: 'La Liga',
  CHAMPIONS_LEAGUE: 'Champions League',
  ATP: 'Tennis',
  WTA: 'Tennis',
  PGA: 'Golf',
  LPGA: 'Golf',
  UFC: 'UFC',
  MMA: 'MMA',
  F1: 'F1',
  NASCAR: 'NASCAR',
  MOTORSPORT: 'Motorsport',
}

export function displaySport(raw: string | null | undefined): string {
  if (!raw) return ''
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (SPORT_DISPLAY[key]) return SPORT_DISPLAY[key]
  // Fallback: humanize an unknown id — replace underscores with spaces
  // and title-case each word so "TABLE_TENNIS" reads as "Table Tennis"
  // instead of "TABLE_TENNIS" or "table tennis".
  return key
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
