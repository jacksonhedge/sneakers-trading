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

const STATUS_CHIP: Record<Venue['status'], { label: string; cls: string }> = {
  live: {
    label: 'LIVE',
    cls: 'bg-emerald-500/15 text-emerald-700 ring-emerald-400/40',
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

export function ConnectionsGrid() {
  const [connections, setConnections] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)
  const [filter, setFilter] = useState<'all' | VenueCategory>('all')
  const byCategory = venuesByCategory()

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

  const counts = {
    total: VENUES.length,
    connected: mounted ? connections.length : 0,
    connectedLive: mounted
      ? connections.filter((id) => VENUES.find((v) => v.id === id)?.status === 'live').length
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
          <div className="text-2xl font-bold text-[#00703c] tabular-nums">
            {counts.connectedLive}
          </div>
          <div className="text-[10px] text-stone-500">
            venues where we scrape live data for your account
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
                const chip = STATUS_CHIP[v.status]
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
                      <button
                        type="button"
                        disabled={!mounted}
                        onClick={() => toggle(v.id)}
                        className={`text-[10px] tracking-wider font-semibold px-2.5 py-1 rounded transition disabled:opacity-50 ${
                          active
                            ? 'bg-stone-200 text-stone-700 hover:bg-stone-300'
                            : 'bg-[#00703c] text-white hover:bg-[#004225]'
                        }`}
                      >
                        {active ? 'DISCONNECT' : 'CONNECT'}
                      </button>
                      {v.affiliateUrl && (
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
