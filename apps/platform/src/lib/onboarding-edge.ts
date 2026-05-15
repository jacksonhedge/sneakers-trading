// Shared definitions for the "Your edge" onboarding step.
//
// Pure data + pure functions only — no 'use client', no server imports —
// so it's safe to pull into both the client form and the server route.
//
// The student's two picks (risk band + strategy style) get composed into a
// marker-delimited block and merged into the user's O'Toole memory, so
// finishing the step literally tunes the AI's per-user strategy.

export type RiskBandId = 'favorites' | 'balanced' | 'longshots' | 'mixed'
export type StrategyStyleId = 'arbitrage' | 'value' | 'momentum' | 'contrarian'

export interface RiskBand {
  id: RiskBandId
  label: string
  range: string
  sub: string
  phrase: string
}

export interface StrategyStyle {
  id: StrategyStyleId
  label: string
  sub: string
  phrase: string
}

export const RISK_BANDS: RiskBand[] = [
  {
    id: 'favorites',
    label: 'Favorites',
    range: '60–90¢',
    sub: 'High hit-rate, small payouts. Grind it out.',
    phrase: 'favorites in the 60–90¢ range',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    range: '35–65¢',
    sub: 'Coin-flip edges, middle of the book.',
    phrase: 'balanced markets around 35–65¢',
  },
  {
    id: 'longshots',
    label: 'Longshots',
    range: '10–35¢',
    sub: 'Low hit-rate, big payouts. Swing for it.',
    phrase: 'longshots in the 10–35¢ range',
  },
  {
    id: 'mixed',
    label: 'Mixed',
    range: 'any price',
    sub: "No fixed band — let O'Toole pick the best-priced edge.",
    phrase: 'whatever price band has the best edge',
  },
]

export const STRATEGY_STYLES: StrategyStyle[] = [
  {
    id: 'arbitrage',
    label: 'Arbitrage',
    sub: 'Lock in cross-book price gaps. Low risk, low variance.',
    phrase: 'cross-book arbitrage',
  },
  {
    id: 'value',
    label: 'Value hunter',
    sub: "Back mispriced markets the crowd hasn't caught yet.",
    phrase: 'value plays the crowd missed',
  },
  {
    id: 'momentum',
    label: 'Momentum',
    sub: 'Ride markets that are moving. In early, out early.',
    phrase: 'momentum trades',
  },
  {
    id: 'contrarian',
    label: 'Contrarian',
    sub: 'Fade the hype. Bet against crowded favorites.',
    phrase: 'contrarian fades',
  },
]

export function isRiskBandId(v: unknown): v is RiskBandId {
  return typeof v === 'string' && RISK_BANDS.some((b) => b.id === v)
}

export function isStrategyStyleId(v: unknown): v is StrategyStyleId {
  return typeof v === 'string' && STRATEGY_STYLES.some((s) => s.id === v)
}

/** One-line, human-readable summary of how the picks tune O'Toole. */
export function edgePreview(risk: RiskBandId, style: StrategyStyleId): string {
  const r = RISK_BANDS.find((b) => b.id === risk)!
  const s = STRATEGY_STYLES.find((b) => b.id === style)!
  return `O'Toole will lead with ${s.phrase} and focus on ${r.phrase} when it proposes trades.`
}

const EDGE_BLOCK_RE = /<!-- sneakers:edge[\s\S]*?<!-- \/sneakers:edge -->/

/** The marker-delimited strategy block written into O'Toole memory. */
export function composeEdgeBlock(risk: RiskBandId, style: StrategyStyleId): string {
  const r = RISK_BANDS.find((b) => b.id === risk)!
  const s = STRATEGY_STYLES.find((b) => b.id === style)!
  return [
    `<!-- sneakers:edge risk=${r.id} style=${s.id} -->`,
    '## My edge (set during onboarding)',
    `- **Risk band:** ${r.label} (${r.range}) — ${r.sub}`,
    `- **Strategy style:** ${s.label} — ${s.sub}`,
    '',
    'When you propose trades, default to this risk band and strategy style unless I tell you otherwise.',
    '<!-- /sneakers:edge -->',
  ].join('\n')
}

/**
 * Merge the edge block into existing O'Toole memory without clobbering
 * anything the user wrote themselves. If a prior edge block exists it's
 * replaced in place; otherwise the new block is prepended.
 */
export function mergeEdgeBlock(
  existing: string,
  risk: RiskBandId,
  style: StrategyStyleId,
): string {
  const block = composeEdgeBlock(risk, style)
  const prev = (existing ?? '').trim()
  if (EDGE_BLOCK_RE.test(prev)) {
    return prev.replace(EDGE_BLOCK_RE, block).trim()
  }
  return prev ? `${block}\n\n${prev}` : block
}

/** Recover the picks from a memory string so the form can pre-fill on re-entry. */
export function parseEdgeBlock(
  memory: string,
): { risk: RiskBandId; style: StrategyStyleId } | null {
  const m = (memory ?? '').match(/<!-- sneakers:edge risk=([a-z-]+) style=([a-z-]+) -->/)
  if (!m) return null
  const [, risk, style] = m
  if (!isRiskBandId(risk) || !isStrategyStyleId(style)) return null
  return { risk, style }
}
