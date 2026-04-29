'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  VENUES,
  CATEGORY_LABELS,
  venuesByCategory,
  type VenueCategory,
  type Venue,
} from '@/lib/venues'
import { loadConnections, saveConnections } from '@/lib/connections'

const CATEGORY_ORDER: VenueCategory[] = [
  'prediction_market',
  'sportsbook',
  'dfs_pickem',
  'sweeps_social',
]

// "LIVE" = label in venues.ts is `live` AND price observations are
// flowing right now (server-side freshness check on /dashboard/connections).
// A venue we marked live but isn't actually scraping gets the dim
// NO DATA pill so the user knows we're not yet feeding it.
type ChipKey = 'live_flowing' | 'live_stale' | 'coming_soon' | 'requested_frequently'

const STATUS_CHIP: Record<ChipKey, { label: string; cls: string }> = {
  live_flowing: {
    label: 'LIVE',
    cls: 'bg-emerald-500 text-white ring-emerald-400/60 shadow-sm shadow-emerald-500/30',
  },
  live_stale: {
    label: 'NO DATA',
    cls: 'bg-stone-200 text-stone-600 ring-stone-300',
  },
  coming_soon: {
    label: 'COMING',
    cls: 'bg-amber-500/10 text-amber-700 ring-amber-400/30',
  },
  requested_frequently: {
    label: 'QUEUED',
    cls: 'bg-stone-400/20 text-stone-600 ring-stone-400/40',
  },
}

function chipKeyFor(v: Venue, freshIds: Set<string>): ChipKey {
  if (v.status === 'live') {
    return freshIds.has(v.id) ? 'live_flowing' : 'live_stale'
  }
  if (v.status === 'coming_soon') return 'coming_soon'
  return 'requested_frequently'
}

export function ConnectionsGrid({
  freshVenueIds = [],
}: {
  freshVenueIds?: string[]
}) {
  const [connections, setConnections] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)
  const [filter, setFilter] = useState<'all' | VenueCategory>('all')
  const byCategory = venuesByCategory()
  const freshIds = new Set(freshVenueIds)

  useEffect(() => {
    setConnections(loadConnections())
    setMounted(true)
  }, [])

  function toggle(id: string) {
    const next = connections.includes(id)
      ? connections.filter((v) => v !== id)
      : [...connections, id]
    saveConnections(next)
    setConnections(next)
  }

  // Click flow: if the venue has an affiliate URL, open it in a new tab
  // (the venue's signup page) and immediately mark the venue as connected
  // locally so the UI reflects intent. The signup happens off-Sneakers.
  function connectViaAffiliate(v: Venue) {
    if (v.affiliateUrl) {
      window.open(v.affiliateUrl, '_blank', 'noopener,noreferrer')
    }
    if (!connections.includes(v.id)) {
      const next = [...connections, v.id]
      saveConnections(next)
      setConnections(next)
    }
  }

  const counts = {
    total: VENUES.length,
    connected: mounted ? connections.length : 0,
    connectedLive: mounted
      ? connections.filter((id) => freshIds.has(id)).length
      : 0,
  }

  const visible =
    filter === 'all'
      ? CATEGORY_ORDER.map((cat) => ({ cat, venues: byCategory[cat] }))
      : [{ cat: filter, venues: byCategory[filter] }]

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="rounded border border-stone-200 bg-white p-4 grid grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] text-stone-400 tracking-[0.15em] font-semibold">
            CONNECTED
          </div>
          <div className="text-2xl font-bold text-stone-900 tabular-nums">
            {counts.connected}
            <span className="text-sm text-stone-500 font-normal"> / {counts.total}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-stone-400 tracking-[0.15em] font-semibold">
            LIVE PRICES FLOWING
          </div>
          <div className="text-2xl font-bold text-emerald-600 tabular-nums inline-flex items-center gap-2">
            {counts.connectedLive}
            {counts.connectedLive > 0 && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                aria-hidden
              />
            )}
          </div>
          <div className="text-[10px] text-stone-500">
            of your connected venues currently scraping
          </div>
        </div>
        <div className="text-[11px] text-stone-500 leading-relaxed">
          Toggle every venue you actually have an account on. Later this will filter markets
          to what you can trade, and power per-venue P&amp;L tracking once Execution lands.
        </div>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All ({VENUES.length})
        </FilterChip>
        {CATEGORY_ORDER.map((cat) => (
          <FilterChip
            key={cat}
            active={filter === cat}
            onClick={() => setFilter(cat)}
          >
            {CATEGORY_LABELS[cat]} ({byCategory[cat].length})
          </FilterChip>
        ))}
      </div>

      {/* Venue grid */}
      <div className="space-y-8">
        {visible.map(({ cat, venues }) => (
          <section key={cat}>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold text-stone-900 tracking-wider">
                {CATEGORY_LABELS[cat].toUpperCase()}
              </h2>
              <span className="text-[11px] text-stone-500">
                {venues.filter((v) => connections.includes(v.id)).length} / {venues.length} connected
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {venues.map((v) => {
                const active = mounted && connections.includes(v.id)
                const chip = STATUS_CHIP[chipKeyFor(v, freshIds)]
                const hasAffiliate = Boolean(v.affiliateUrl)
                return (
                  <div
                    key={v.id}
                    className={`rounded border p-3 transition ${
                      active
                        ? 'bg-[#00703c]/5 border-[#00703c]/40 ring-1 ring-[#00703c]/30'
                        : 'bg-white border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-stone-900 truncate">
                          {v.name}
                        </div>
                        {v.wrapperOf && (
                          <div className="text-[10px] text-stone-500 tracking-wider">
                            POWERED BY {v.wrapperOf.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[9px] tracking-wider font-semibold px-1.5 py-0.5 rounded ring-1 whitespace-nowrap ${chip.cls}`}
                      >
                        {chip.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500 mb-3 line-clamp-2">
                      {v.blurb}
                    </div>
                    <div className="flex items-center justify-between">
                      {active ? (
                        <button
                          type="button"
                          onClick={() => toggle(v.id)}
                          className="text-[10px] tracking-wider font-semibold px-2.5 py-1 rounded bg-stone-200 text-stone-700 hover:bg-stone-300 transition"
                        >
                          DISCONNECT
                        </button>
                      ) : hasAffiliate ? (
                        <button
                          type="button"
                          disabled={!mounted}
                          onClick={() => connectViaAffiliate(v)}
                          title={`Sign up at ${v.name} via Sneakers — opens ${v.affiliateUrl}`}
                          className="inline-flex items-center gap-1 text-[10px] tracking-wider font-semibold px-2.5 py-1 rounded bg-[#00703c] text-white hover:bg-[#004225] transition disabled:opacity-50"
                        >
                          CONNECT <span aria-hidden>↗</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!mounted}
                          onClick={() => toggle(v.id)}
                          className="text-[10px] tracking-wider font-semibold px-2.5 py-1 rounded bg-[#00703c] text-white hover:bg-[#004225] transition disabled:opacity-50"
                        >
                          CONNECT
                        </button>
                      )}
                      {hasAffiliate && (
                        <a
                          href={v.affiliateUrl}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className="text-[10px] text-stone-500 hover:text-[#00703c] tracking-wider"
                        >
                          open ↗
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="text-[11px] text-stone-500 border-t border-stone-200 pt-4">
        Connections currently stored in your browser&apos;s localStorage. When user profiles land,
        this moves to a Supabase table so your connections sync across devices and into the iOS
        app. Browse the full venue catalog at{' '}
        <Link href="/venues" className="text-[#00703c] hover:underline">
          /venues
        </Link>
        .
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] tracking-wider px-3 py-1.5 rounded-full ring-1 transition ${
        active
          ? 'bg-[#00703c]/10 text-[#004225] ring-[#00703c]/60 font-semibold'
          : 'bg-white text-stone-600 ring-stone-300 hover:bg-stone-50'
      }`}
    >
      {children}
    </button>
  )
}
