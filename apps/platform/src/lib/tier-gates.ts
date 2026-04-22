'use client'

import { useTier as useServerTier } from './use-tier'
import type { Tier } from './subscriptions'

// Source-of-truth for which UI surfaces each tier can see. Reads tier from
// the server (via /api/me/tier) so subscription state, not localStorage,
// drives gates. While the fetch is in flight we return 'free' — a paywall
// flicker on initial load is preferable to flashing premium content to a
// free user.

export function useTier(): Tier {
  const { tier } = useServerTier()
  return tier ?? 'free'
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
