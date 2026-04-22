'use client'

import { useSyncExternalStore } from 'react'
import type { Tier } from './subscriptions'

// Source-of-truth for which UI surfaces each tier can see. When Stripe
// ships, the hook swaps to reading server-provided tier instead of
// localStorage — consumers of useTier() / gates() don't change.

const STORAGE_KEY = 'sneakers:tier:v1'

function readTier(): Tier {
  if (typeof window === 'undefined') return 'free'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'pro' || raw === 'elite' || raw === 'business' || raw === 'free') return raw
  } catch {}
  return 'free'
}

function subscribe(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export function useTier(): Tier {
  return useSyncExternalStore(subscribe, readTier, () => 'free')
}

const RANK: Record<Tier, number> = { free: 0, pro: 1, elite: 2, business: 3 }

export function atLeast(tier: Tier, min: Tier): boolean {
  return RANK[tier] >= RANK[min]
}

// Feature gates. Aligned with the feature matrix in
// docs/HANDOFF_STRIPE_SUBSCRIPTIONS.md — add entries here when the
// matrix grows.
export function gates(tier: Tier) {
  return {
    canSeeLiveArbs: atLeast(tier, 'pro'),
    canSeeCrossVenue: atLeast(tier, 'pro'),
    canSeeOverroundHeatmap: atLeast(tier, 'elite'),
    canSeeDriftChart: atLeast(tier, 'elite'),
    canExportCsv: atLeast(tier, 'elite'),
    canSeeTeamSeats: atLeast(tier, 'business'),
  }
}

export type TierGates = ReturnType<typeof gates>
