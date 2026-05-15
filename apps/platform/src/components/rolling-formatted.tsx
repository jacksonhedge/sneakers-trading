'use client'

import { RollingNumber } from './rolling-number'

// Client wrapper for RollingNumber that takes a STRING format key instead
// of a `format: (n: number) => string` function. Server Components can
// render <RollingFormatted format="percent" .../> safely — Next 16 forbids
// passing function-typed props across the server/client boundary, which
// trips the dashboard's whole-page error boundary in production. Keep this
// wrapper as the canonical entry point from any RSC; use RollingNumber
// directly only from inside another 'use client' file.

export type RollingFormat =
  | 'percent' // 0.42 → "42%"
  | 'percent1dp' // 0.0123 → "1.2%"
  | 'fixed2' // 0.42 → "0.42"
  | 'cents' // 0.42 → "42¢"
  | 'cents1dp' // 0.4237 → "42.4¢"

const FORMATTERS: Record<RollingFormat, (n: number) => string> = {
  percent: (n) => `${Math.round(n * 100)}%`,
  percent1dp: (n) => `${(n * 100).toFixed(1)}%`,
  fixed2: (n) => n.toFixed(2),
  cents: (n) => `${Math.round(n * 100)}¢`,
  cents1dp: (n) => `${(n * 100).toFixed(1)}¢`,
}

export function RollingFormatted({
  value,
  format,
  flashScale,
  className,
  ariaLabel,
}: {
  value: number
  format: RollingFormat
  flashScale?: number
  className?: string
  ariaLabel?: string
}) {
  return (
    <RollingNumber
      value={value}
      format={FORMATTERS[format]}
      flashScale={flashScale}
      className={className}
      ariaLabel={ariaLabel}
    />
  )
}
