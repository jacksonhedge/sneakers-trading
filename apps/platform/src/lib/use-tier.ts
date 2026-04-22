'use client'

import { useEffect, useState } from 'react'
import type { MeTierResponse } from '@/app/api/me/tier/route'

// Client-side tier readout. Convenience for UI gates only — every protected
// endpoint must still call requireTier server-side.
//
// Single fetch on mount; no revalidation. If the user upgrades in another
// tab and comes back, force a refetch with the returned `refresh()` callback.

export interface UseTierResult {
  tier: MeTierResponse['tier'] | null
  status: string | null
  isActive: boolean
  accountType: 'individual' | 'business' | null
  businessSubtype: 'standard' | 'fraternity' | null
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function useTier(): UseTierResult {
  const [data, setData] = useState<MeTierResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    fetch('/api/me/tier', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          if (cancelled) return
          setData(null)
          setError(res.status === 401 ? 'unauthenticated' : `http_${res.status}`)
          return
        }
        const body = (await res.json()) as MeTierResponse
        if (cancelled) return
        setData(body)
        setError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'fetch_failed')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return {
    tier: data?.tier ?? null,
    status: data?.status ?? null,
    isActive: data?.isActive ?? false,
    accountType: data?.accountType ?? null,
    businessSubtype: data?.businessSubtype ?? null,
    isLoading,
    error,
    refresh: () => setNonce((n) => n + 1),
  }
}
