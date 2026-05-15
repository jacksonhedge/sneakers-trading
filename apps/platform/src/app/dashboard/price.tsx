'use client'

import { formatPrice, usePriceFormat, type PriceFormat } from '@/lib/price-format'
import { RollingNumber } from '@/components/rolling-number'

// Drop-in component for rendering a probability (0-1) in the user's
// preferred format. Use wherever a raw `${(p*100).toFixed(1)}%` appears.
// Components that need to branch on format (e.g., different color per
// format) can call usePriceFormat() + formatPrice() directly.
//
// Animates by default — when `value` changes, digits roll with a
// direction-tinted flash. Set `noAnimate` to opt out for contexts
// where the value is static for the component's lifetime (e.g., a
// confirm card showing the proposal price at draft time).

export function Price({
  value,
  override,
  className,
  noAnimate = false,
}: {
  value: number | null | undefined
  override?: PriceFormat
  className?: string
  noAnimate?: boolean
}) {
  const format = usePriceFormat()
  const f = override ?? format
  if (value == null || !Number.isFinite(value)) {
    return <span className={className}>—</span>
  }
  if (noAnimate) {
    return <span className={className}>{formatPrice(value, f)}</span>
  }
  return (
    <span className={className}>
      <RollingNumber
        value={value}
        format={(v) => formatPrice(v, f)}
        flashScale={0.03}
      />
    </span>
  )
}
