'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { findVenue } from '@/lib/venues'

type VenueRow = {
  venue: string
  status: 'ok' | 'error' | 'unsupported' | 'no_credentials'
  cents?: number
  error?: string
}

type BalanceResponse = {
  ok: true
  totalCents: number
  currency: 'USD'
  fetchedAt: string
  byVenue: VenueRow[]
}

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function venueLabel(id: string): string {
  return findVenue(id)?.name ?? id
}

export function BalanceCard() {
  const [data, setData] = useState<BalanceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/balance', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`balance request failed (${r.status})`)
        return (await r.json()) as BalanceResponse
      })
      .then((res) => {
        if (cancelled) return
        setData(res)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'unknown error')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return null
  if (error) return null
  if (!data) return null

  // Empty state — no credentials connected yet. Render a card with a
  // CTA pointing at /dashboard/connections so users discover where to
  // wire venues up. Previously this returned null and the surface was
  // invisible — verifier flagged that as a missing empty state.
  if (data.byVenue.length === 0) {
    return (
      <div className="rounded border border-stone-200 bg-white px-4 py-3 shadow-sm">
        <div className="text-[10px] text-stone-500 tracking-wider uppercase">
          Sneakers Balance
        </div>
        <div className="mt-1 text-sm text-stone-700 leading-relaxed">
          Connect a venue to see your balance here. We support Polymarket,
          Kalshi, and Opinion today — more on the way.
        </div>
        <Link
          href="/dashboard/connections"
          className="mt-3 inline-block text-xs px-3 py-1.5 tracking-wider rounded bg-[#00703c] text-white hover:bg-[#005a30] transition"
        >
          CONNECT A VENUE →
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] text-stone-500 tracking-wider uppercase">
            Sneakers Balance
          </div>
          <div className="text-2xl font-semibold text-stone-900 font-mono tabular-nums tracking-tight">
            {formatUsd(data.totalCents)}
          </div>
        </div>
        <div className="text-[10px] text-stone-400 tracking-wider">
          {data.byVenue.length} {data.byVenue.length === 1 ? 'venue' : 'venues'}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5">
        {data.byVenue.map((row) => (
          <div
            key={row.venue}
            className="flex items-center justify-between text-xs"
          >
            <span className="text-stone-700">{venueLabel(row.venue)}</span>
            <BalanceCell row={row} />
          </div>
        ))}
      </div>
    </div>
  )
}

function BalanceCell({ row }: { row: VenueRow }) {
  if (row.status === 'ok' && typeof row.cents === 'number') {
    return (
      <span className="text-stone-900 font-mono tabular-nums">
        {formatUsd(row.cents)}
      </span>
    )
  }
  if (row.status === 'no_credentials') {
    return <span className="text-stone-400">not connected</span>
  }
  if (row.status === 'unsupported') {
    return <span className="text-stone-400">coming soon</span>
  }
  return (
    <span className="text-amber-700" title={row.error ?? 'fetch failed'}>
      unavailable
    </span>
  )
}
