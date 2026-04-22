'use client'

import { useSyncExternalStore } from 'react'

// Three ways users think about prediction-market prices:
//   pct       → "42%"       (default; what the dashboard has always shown)
//   cents     → "42¢"       (prediction-market native — Kalshi / Polymarket UI)
//   american  → "+138 / -140" (sportsbook native — DK / FD / BetMGM)
//
// One global preference per visitor, stored in localStorage. Components use
// <Price value={p} /> or formatPrice(p, useFormat()) and the whole app flips
// instantly on toggle.

export type PriceFormat = 'pct' | 'cents' | 'american'

const STORAGE_KEY = 'sneakers:price_format:v1'
const DEFAULT: PriceFormat = 'pct'

function readFormat(): PriceFormat {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'pct' || raw === 'cents' || raw === 'american') return raw
  } catch {}
  return DEFAULT
}

function subscribe(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb()
  }
  const customHandler = () => cb()
  window.addEventListener('storage', handler)
  window.addEventListener('sneakers:price-format-change', customHandler)
  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener('sneakers:price-format-change', customHandler)
  }
}

export function usePriceFormat(): PriceFormat {
  return useSyncExternalStore(subscribe, readFormat, () => DEFAULT)
}

export function setPriceFormat(next: PriceFormat) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, next)
  // same-tab notifier: the native `storage` event only fires cross-tab.
  window.dispatchEvent(new Event('sneakers:price-format-change'))
}

export function formatPrice(p: number | null | undefined, format: PriceFormat): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '—'
  // Guard against accidental 0-100 inputs — the whole pipeline uses 0-1 but
  // guardrails are cheap.
  const prob = p > 1 ? p / 100 : p
  if (prob <= 0) {
    if (format === 'american') return '—'
    return format === 'cents' ? '0¢' : '0%'
  }
  if (prob >= 1) {
    if (format === 'american') return '—'
    return format === 'cents' ? '100¢' : '100%'
  }

  if (format === 'cents') {
    return `${Math.round(prob * 100)}¢`
  }
  if (format === 'american') {
    // p >= 0.5 → odds-on → negative American odds
    // p <  0.5 → underdog → positive American odds
    if (prob >= 0.5) {
      const odds = -Math.round((prob / (1 - prob)) * 100)
      return `${odds}`
    }
    const odds = Math.round(((1 - prob) / prob) * 100)
    return `+${odds}`
  }
  // pct — match the existing `${(p * 100).toFixed(1)}%` conventions elsewhere
  return `${(prob * 100).toFixed(1)}%`
}

export const FORMAT_LABELS: Record<PriceFormat, { short: string; long: string }> = {
  pct: { short: '%', long: 'Percent' },
  cents: { short: '¢', long: 'Cents' },
  american: { short: '±', long: 'American' },
}
