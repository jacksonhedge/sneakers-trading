'use client'

import { useState } from 'react'
import type { Venue } from '@/lib/venues'

const STATUS_LABEL: Record<Venue['status'], string> = {
  live: 'LIVE',
  coming_soon: 'COMING SOON',
  requested_frequently: 'REQUEST',
}

const STATUS_CLASSES: Record<Venue['status'], string> = {
  live: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/40',
  coming_soon: 'bg-amber-500/10 text-amber-300 ring-amber-400/30',
  requested_frequently: 'bg-stone-700/30 text-stone-300 ring-stone-500/30',
}

export function VenueCard({ venue }: { venue: Venue }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>(
    'idle'
  )
  const [openForm, setOpenForm] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setState('submitting')
    const res = await fetch('/api/venues/access-request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        venueId: venue.id,
        source: 'venues_page',
      }),
    })
    if (res.ok) setState('done')
    else setState('error')
  }

  const isLive = venue.status === 'live'
  const statusLabel = STATUS_LABEL[venue.status]
  const statusClass = STATUS_CLASSES[venue.status]
  const [logoBroken, setLogoBroken] = useState(false)
  const logoSrc = venue.logo ?? `/SneakersLogos/partners/${venue.id}.png`

  return (
    <div className="group flex flex-col rounded-lg bg-stone-950/80 ring-1 ring-stone-800 p-5 hover:ring-emerald-400/40 transition">
      <div className="flex items-start justify-between mb-3 gap-3">
        {!logoBroken && (
          <div className="flex-shrink-0 w-10 h-10 rounded bg-stone-900 ring-1 ring-stone-800 flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt={`${venue.name} logo`}
              className="w-full h-full object-contain"
              onError={() => setLogoBroken(true)}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white leading-tight truncate">
            {venue.name}
          </div>
          {venue.wrapperOf && (
            <div className="text-[10px] text-stone-500 mt-0.5 tracking-wider">
              POWERED BY {venue.wrapperOf.toUpperCase()}
            </div>
          )}
        </div>
        <span
          className={`text-[10px] font-semibold tracking-wider rounded-full ring-1 px-2 py-0.5 flex-shrink-0 ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      <p className="text-xs text-stone-400 leading-snug flex-1 mb-4">
        {venue.blurb}
      </p>

      {/* Price box placeholder — filled with real data once venue is wired in */}
      <div className="rounded bg-stone-900 ring-1 ring-stone-800 px-3 py-2 mb-3 text-center">
        <div className="text-[10px] text-stone-500 tracking-wider mb-0.5">
          BEST PRICE
        </div>
        <div className="font-mono text-sm text-stone-400">
          {isLive ? '— updating —' : '—'}
        </div>
      </div>

      {state === 'done' ? (
        <div className="text-xs text-emerald-400 text-center py-2">
          ✓ We’ll email you when it’s live.
        </div>
      ) : isLive && venue.affiliateUrl ? (
        <a
          href={venue.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-xs font-semibold rounded bg-emerald-500 text-stone-950 py-2 hover:bg-emerald-400 transition"
        >
          Trade on {venue.name} →
        </a>
      ) : openForm ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded bg-stone-900 ring-1 ring-stone-700 text-xs text-white px-3 py-2 focus:outline-none focus:ring-emerald-400"
          />
          <button
            type="submit"
            disabled={state === 'submitting'}
            className="text-xs font-semibold rounded bg-emerald-500/90 text-stone-950 py-2 hover:bg-emerald-400 disabled:opacity-60"
          >
            {state === 'submitting'
              ? 'Requesting…'
              : state === 'error'
                ? 'Try again'
                : 'Request access'}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setOpenForm(true)}
          className="text-xs font-semibold rounded bg-stone-800 ring-1 ring-stone-700 text-white py-2 hover:bg-stone-700 transition"
        >
          Request early access
        </button>
      )}
    </div>
  )
}
