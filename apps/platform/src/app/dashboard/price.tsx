'use client'

import { formatPrice, usePriceFormat, type PriceFormat } from '@/lib/price-format'

// Drop-in component for rendering a probability (0-1) in the user's
// preferred format. Use wherever a raw `${(p*100).toFixed(1)}%` appears.
// Components that need to branch on format (e.g., different color per
// format) can call usePriceFormat() + formatPrice() directly.

export function Price({
  value,
  override,
  className,
}: {
  value: number | null | undefined
  override?: PriceFormat
  className?: string
}) {
  const format = usePriceFormat()
  const f = override ?? format
  return <span className={className}>{formatPrice(value, f)}</span>
}
