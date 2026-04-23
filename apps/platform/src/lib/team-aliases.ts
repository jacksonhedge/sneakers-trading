/**
 * Team alias registry for the 4 major US pro sports leagues.
 *
 * Each team maps to a canonical mascot key (`lakers`, `knicks`, `yankees`)
 * plus the alternate phrasings that appear across scraper feeds:
 *   - "Los Angeles Lakers" (OddsAPI, Polymarket full)
 *   - "LA Lakers" (some secondary books)
 *   - "Lakers" (shorthand)
 *   - "Los Angeles" (Kalshi-style single-city)
 *
 * Why a hand-curated registry? Team-name formatting varies wildly across
 * scrapers and we need reliable matching for the cross-venue overlap view.
 * Automated fuzzy matching on city-only vs. mascot-only strings produces too
 * many false positives (e.g., "New York" could be Knicks, Rangers, Yankees,
 * Mets, Giants, Jets, Liberty, City FC). The sport discriminator plus this
 * registry gets us to clean matches.
 *
 * When a team is missing: extractTeams falls back to heuristic title-case
 * extraction, so non-registered teams still produce *some* signature — just
 * less robust across rephrasings.
 */

// The canonical form is always the mascot (lowercase, single word) when the
// team has one. For soccer clubs where the identifier is the city or a
// multi-word name, use the most-recognizable short form.
export const TEAMS_BY_SPORT: Record<string, Record<string, string[]>> = {
  basketball: {
    hawks: ['atlanta hawks', 'atlanta', 'hawks'],
    celtics: ['boston celtics', 'boston', 'celtics'],
    nets: ['brooklyn nets', 'brooklyn', 'nets'],
    hornets: ['charlotte hornets', 'charlotte', 'hornets'],
    bulls: ['chicago bulls', 'chicago', 'bulls'],
    cavaliers: ['cleveland cavaliers', 'cleveland', 'cavaliers', 'cavs'],
    mavericks: ['dallas mavericks', 'dallas', 'mavericks', 'mavs'],
    nuggets: ['denver nuggets', 'denver', 'nuggets'],
    pistons: ['detroit pistons', 'detroit', 'pistons'],
    warriors: ['golden state warriors', 'golden state', 'gs warriors', 'warriors'],
    rockets: ['houston rockets', 'houston', 'rockets'],
    pacers: ['indiana pacers', 'indiana', 'pacers'],
    clippers: ['los angeles clippers', 'la clippers', 'clippers'],
    lakers: ['los angeles lakers', 'la lakers', 'lakers'],
    grizzlies: ['memphis grizzlies', 'memphis', 'grizzlies'],
    heat: ['miami heat', 'miami', 'heat'],
    bucks: ['milwaukee bucks', 'milwaukee', 'bucks'],
    timberwolves: ['minnesota timberwolves', 'minnesota', 'timberwolves', 'wolves'],
    pelicans: ['new orleans pelicans', 'new orleans', 'pelicans'],
    knicks: ['new york knicks', 'ny knicks', 'knicks'],
    thunder: ['oklahoma city thunder', 'oklahoma city', 'okc thunder', 'okc', 'thunder'],
    magic: ['orlando magic', 'orlando', 'magic'],
    sixers: ['philadelphia 76ers', 'philadelphia', '76ers', 'sixers'],
    suns: ['phoenix suns', 'phoenix', 'suns'],
    blazers: ['portland trail blazers', 'portland', 'trail blazers', 'blazers'],
    kings: ['sacramento kings', 'sacramento', 'kings'],
    spurs: ['san antonio spurs', 'san antonio', 'spurs'],
    raptors: ['toronto raptors', 'toronto', 'raptors'],
    jazz: ['utah jazz', 'utah', 'jazz'],
    wizards: ['washington wizards', 'washington', 'wizards'],
  },
  baseball: {
    diamondbacks: ['arizona diamondbacks', 'arizona', 'diamondbacks', 'dbacks'],
    braves: ['atlanta braves', 'atlanta', 'braves'],
    orioles: ['baltimore orioles', 'baltimore', 'orioles'],
    redsox: ['boston red sox', 'boston', 'red sox', 'redsox'],
    cubs: ['chicago cubs', 'cubs'],
    whitesox: ['chicago white sox', 'white sox', 'whitesox'],
    reds: ['cincinnati reds', 'cincinnati', 'reds'],
    guardians: ['cleveland guardians', 'cleveland', 'guardians'],
    rockies: ['colorado rockies', 'colorado', 'rockies'],
    tigers: ['detroit tigers', 'detroit', 'tigers'],
    astros: ['houston astros', 'houston', 'astros'],
    royals: ['kansas city royals', 'kansas city', 'royals'],
    angels: ['los angeles angels', 'la angels', 'angels'],
    dodgers: ['los angeles dodgers', 'la dodgers', 'dodgers'],
    marlins: ['miami marlins', 'miami', 'marlins'],
    brewers: ['milwaukee brewers', 'milwaukee', 'brewers'],
    twins: ['minnesota twins', 'minnesota', 'twins'],
    mets: ['new york mets', 'ny mets', 'mets'],
    yankees: ['new york yankees', 'ny yankees', 'yankees'],
    athletics: ['oakland athletics', 'oakland', 'athletics', "a's", 'as'],
    phillies: ['philadelphia phillies', 'philadelphia', 'phillies'],
    pirates: ['pittsburgh pirates', 'pittsburgh', 'pirates'],
    padres: ['san diego padres', 'san diego', 'padres'],
    giants: ['san francisco giants', 'san francisco', 'sf giants', 'giants'],
    mariners: ['seattle mariners', 'seattle', 'mariners'],
    cardinals: ['st louis cardinals', 'st. louis cardinals', 'st louis', 'cardinals'],
    rays: ['tampa bay rays', 'tampa bay', 'rays'],
    rangers: ['texas rangers', 'texas', 'rangers'],
    bluejays: ['toronto blue jays', 'toronto', 'blue jays', 'bluejays'],
    nationals: ['washington nationals', 'washington', 'nationals', 'nats'],
  },
  hockey: {
    ducks: ['anaheim ducks', 'anaheim', 'ducks'],
    bruins: ['boston bruins', 'boston', 'bruins'],
    sabres: ['buffalo sabres', 'buffalo', 'sabres'],
    flames: ['calgary flames', 'calgary', 'flames'],
    hurricanes: ['carolina hurricanes', 'carolina', 'hurricanes', 'canes'],
    blackhawks: ['chicago blackhawks', 'chicago', 'blackhawks'],
    avalanche: ['colorado avalanche', 'colorado', 'avalanche', 'avs'],
    bluejackets: ['columbus blue jackets', 'columbus', 'blue jackets', 'bluejackets'],
    stars: ['dallas stars', 'dallas', 'stars'],
    redwings: ['detroit red wings', 'detroit', 'red wings', 'redwings'],
    oilers: ['edmonton oilers', 'edmonton', 'oilers'],
    panthers: ['florida panthers', 'florida', 'panthers'],
    kings: ['los angeles kings', 'la kings'],
    wild: ['minnesota wild', 'minnesota', 'wild'],
    canadiens: ['montreal canadiens', 'montréal canadiens', 'montreal', 'montréal', 'canadiens', 'habs'],
    predators: ['nashville predators', 'nashville', 'predators', 'preds'],
    devils: ['new jersey devils', 'new jersey', 'devils'],
    islanders: ['new york islanders', 'ny islanders', 'islanders', 'isles'],
    rangers: ['new york rangers', 'ny rangers'],
    senators: ['ottawa senators', 'ottawa', 'senators', 'sens'],
    flyers: ['philadelphia flyers', 'philadelphia', 'flyers'],
    penguins: ['pittsburgh penguins', 'pittsburgh', 'penguins', 'pens'],
    sharks: ['san jose sharks', 'san jose', 'sharks'],
    kraken: ['seattle kraken', 'seattle', 'kraken'],
    blues: ['st louis blues', 'st. louis blues', 'st louis', 'blues'],
    lightning: ['tampa bay lightning', 'tampa bay', 'lightning', 'bolts'],
    mapleleafs: ['toronto maple leafs', 'toronto', 'maple leafs', 'mapleleafs', 'leafs'],
    mammoth: ['utah mammoth', 'utah', 'mammoth'],
    canucks: ['vancouver canucks', 'vancouver', 'canucks'],
    goldenknights: ['vegas golden knights', 'las vegas golden knights', 'golden knights', 'vegas', 'las vegas'],
    capitals: ['washington capitals', 'washington', 'capitals', 'caps'],
    jets: ['winnipeg jets', 'winnipeg'],
  },
  football_us: {
    cardinals: ['arizona cardinals', 'arizona'],
    falcons: ['atlanta falcons', 'atlanta', 'falcons'],
    ravens: ['baltimore ravens', 'baltimore', 'ravens'],
    bills: ['buffalo bills', 'buffalo', 'bills'],
    panthers: ['carolina panthers', 'carolina'],
    bears: ['chicago bears', 'chicago', 'bears'],
    bengals: ['cincinnati bengals', 'cincinnati', 'bengals'],
    browns: ['cleveland browns', 'cleveland', 'browns'],
    cowboys: ['dallas cowboys', 'dallas', 'cowboys'],
    broncos: ['denver broncos', 'denver', 'broncos'],
    lions: ['detroit lions', 'detroit', 'lions'],
    packers: ['green bay packers', 'green bay', 'packers'],
    texans: ['houston texans', 'houston', 'texans'],
    colts: ['indianapolis colts', 'indianapolis', 'colts'],
    jaguars: ['jacksonville jaguars', 'jacksonville', 'jaguars', 'jags'],
    chiefs: ['kansas city chiefs', 'kansas city', 'chiefs'],
    raiders: ['las vegas raiders', 'las vegas', 'vegas', 'raiders'],
    chargers: ['los angeles chargers', 'la chargers', 'chargers'],
    rams: ['los angeles rams', 'la rams', 'rams'],
    dolphins: ['miami dolphins', 'miami', 'dolphins'],
    vikings: ['minnesota vikings', 'minnesota', 'vikings'],
    patriots: ['new england patriots', 'new england', 'patriots', 'pats'],
    saints: ['new orleans saints', 'new orleans', 'saints'],
    giants: ['new york giants', 'ny giants'],
    jets: ['new york jets', 'ny jets'],
    eagles: ['philadelphia eagles', 'philadelphia', 'eagles'],
    steelers: ['pittsburgh steelers', 'pittsburgh', 'steelers'],
    fortyniners: ['san francisco 49ers', 'san francisco', 'sf 49ers', '49ers', 'niners'],
    seahawks: ['seattle seahawks', 'seattle', 'seahawks'],
    buccaneers: ['tampa bay buccaneers', 'tampa bay', 'buccaneers', 'bucs'],
    titans: ['tennessee titans', 'tennessee', 'titans'],
    commanders: ['washington commanders', 'washington', 'commanders'],
  },
}

// Cross-sport teams that share a city name need a way to disambiguate when
// the question only mentions the city (e.g., "Minnesota wins by over 14.5").
// In these cases, we use the known `sport` field of the snapshot to pick the
// right league's team registry. The signature doesn't need cross-league
// matching — a basketball question won't collide with a hockey one because
// sport is part of the signature.

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Flip the registry into an (alias -> canonical) lookup per sport, computed
// once at module load. Aliases are lowercased + whitespace-collapsed.
export const TEAM_LOOKUP: Record<string, Map<string, string>> = {}
for (const [sport, teams] of Object.entries(TEAMS_BY_SPORT)) {
  const map = new Map<string, string>()
  for (const [canonical, aliases] of Object.entries(teams)) {
    for (const alias of aliases) {
      const key = alias.toLowerCase().replace(/\s+/g, ' ').trim()
      map.set(key, canonical)
    }
    map.set(canonical.toLowerCase(), canonical)
  }
  TEAM_LOOKUP[sport] = map
}

/**
 * Precompiled regex patterns per sport, sorted by alias length descending so
 * longer aliases match first (e.g., "los angeles lakers" is tried before
 * "lakers" alone). This is the hot path — 27k+ snapshots × 100+ aliases per
 * sport × regex compilation was taking ~20s per page load before this cache.
 * Built once at module load; re-used for every canonicalize call.
 */
export const TEAM_PATTERNS: Record<string, Array<[RegExp, string]>> = {}
for (const [sport, map] of Object.entries(TEAM_LOOKUP)) {
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length)
  const patterns: Array<[RegExp, string]> = []
  for (const [alias, canonical] of entries) {
    patterns.push([new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i'), canonical])
  }
  TEAM_PATTERNS[sport] = patterns
}

/**
 * Canonicalize all known team mentions in a question string to their mascot
 * keys. Returns a sorted, deduped set. Uses word-boundary matching so
 * "Thunder" (OKC) won't falsely match "Thunderstruck" as a word.
 */
export function canonicalizeTeams(question: string, sport: string): string[] {
  const patterns = TEAM_PATTERNS[sport]
  if (!patterns) return []
  const hits = new Set<string>()
  const qLower = question.toLowerCase()
  for (const [pattern, canonical] of patterns) {
    if (pattern.test(qLower)) hits.add(canonical)
  }
  return [...hits].sort()
}
