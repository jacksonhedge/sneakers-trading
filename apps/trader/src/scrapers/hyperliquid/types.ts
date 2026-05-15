// Hyperliquid is a perp DEX, not a prediction market — its data shape doesn't
// fit MarketSnapshot (no outcomes, no implied prob, no overround). Perps live
// in their own JSONL stream, consumed by O'Toole as analytical context rather
// than feeding the cross-book arb scanner.

export interface PerpSnapshot {
  ts: string  // ISO timestamp
  coin: string  // e.g. "BTC", "HYPE"
  mark_px: number | null
  oracle_px: number | null
  mid_px: number | null
  prev_day_px: number | null
  funding_hourly: number | null  // hourly funding rate (raw, not annualized)
  funding_apr: number | null  // annualized = hourly * 24 * 365
  open_interest: number | null  // in coin units
  open_interest_usd: number | null  // OI valued at mark
  day_ntl_vlm: number | null  // 24h notional volume USD
  premium: number | null  // (mark - oracle) / oracle
  max_leverage: number | null
  sz_decimals: number | null
}

export interface ScrapeRunMeta {
  ts: string
  coins_seen: number
  errors: number
  duration_ms: number
}
