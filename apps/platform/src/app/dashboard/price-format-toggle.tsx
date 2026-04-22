'use client'

import { FORMAT_LABELS, setPriceFormat, usePriceFormat, type PriceFormat } from '@/lib/price-format'

const ORDER: PriceFormat[] = ['pct', 'cents', 'american']

export function PriceFormatToggle() {
  const current = usePriceFormat()
  return (
    <div
      className="inline-flex rounded border border-stone-300 bg-white overflow-hidden"
      role="group"
      aria-label="Price format"
    >
      {ORDER.map((f) => {
        const active = current === f
        return (
          <button
            key={f}
            type="button"
            onClick={() => setPriceFormat(f)}
            aria-pressed={active}
            title={FORMAT_LABELS[f].long}
            className={`px-2 py-1 text-[11px] tracking-wider transition ${
              active
                ? 'bg-[#00703c] text-white font-semibold'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {FORMAT_LABELS[f].short}
          </button>
        )
      })}
    </div>
  )
}
