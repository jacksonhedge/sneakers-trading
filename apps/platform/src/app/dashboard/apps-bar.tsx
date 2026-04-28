'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { VENUES } from '@/lib/venues'

// Map of venue id → real logo asset under /SneakersLogos/partners.
// Falls through to the colored-letter fallback for venues without an
// asset yet.
const VENUE_LOGO: Record<string, string> = {
  polymarket: '/SneakersLogos/partners/polymarket.png',
  kalshi: '/SneakersLogos/partners/kalshi.png',
  novig: '/SneakersLogos/partners/novig.png',
  prophetx: '/SneakersLogos/partners/prophetx.png',
  og_markets: '/SneakersLogos/partners/og.png',
  og: '/SneakersLogos/partners/og.png',
  limitless: '/SneakersLogos/partners/limitless.svg',
  opinion: '/SneakersLogos/partners/opinion.svg',
  gemini: '/SneakersLogos/partners/gemini.svg',
  underdog: '/SneakersLogos/partners/underdog.png',
  prizepicks: '/SneakersLogos/partners/prizepicks.png',
  prizepicks_predictions: '/SneakersLogos/partners/prizepicks_predictions.png',
  fanduel_predicts: '/SneakersLogos/partners/fanduel_predicts.png',
  fanduel_sb: '/SneakersLogos/partners/fanduel_sb.png',
  draftkings_sb: '/SneakersLogos/partners/draftkings_sb.png',
  dk_predictions: '/SneakersLogos/partners/dk_predictions.png',
  fanatics_predicts: '/SneakersLogos/partners/fanatics_predicts.png',
  coinbase_predict: '/SneakersLogos/partners/coinbase_predict.png',
  robinhood_events: '/SneakersLogos/partners/robinhood_events.png',
  sleeper_picks: '/SneakersLogos/partners/sleeper_picks.png',
}

function VenueIcon({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  const src = VENUE_LOGO[id]
  if (src) {
    return (
      <span
        className="rounded-full bg-white ring-1 ring-stone-200 inline-flex items-center justify-center overflow-hidden shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      </span>
    )
  }
  // Fallback: colored-circle initial.
  return (
    <span
      className="rounded-full ring-1 ring-stone-200 inline-flex items-center justify-center text-[9px] font-bold text-stone-700 shrink-0"
      style={{
        width: size,
        height: size,
        background: venueAccent(id),
      }}
      aria-hidden
    >
      {name[0]}
    </span>
  )
}

// Heyday-style integration row — small icons next to the profile
// avatar in the top nav. Click any → goes to that venue's connection
// page (settings/autotrade for live, /venues for the others).
// Click the + → drawer with every supported venue, live + coming soon
// + requested-frequently, so the user can pick what to connect next.

const FEATURED_IDS = ['polymarket', 'kalshi', 'novig', 'prophetx'] as const

export function AppsBar() {
  const [pickerOpen, setPickerOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!pickerOpen) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  const featured = FEATURED_IDS.map((id) => VENUES.find((v) => v.id === id)).filter(
    (v): v is NonNullable<typeof v> => Boolean(v),
  )

  return (
    <div className="relative flex items-center gap-1.5" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        aria-label="Connect more apps"
        className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition text-lg"
      >
        +
      </button>
      {featured.map((v) => (
        <Link
          key={v.id}
          href="/dashboard/connections"
          title={v.name}
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-stone-100 transition"
        >
          <VenueIcon id={v.id} name={v.name} size={30} />
        </Link>
      ))}

      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="false"
          className="absolute right-0 top-full mt-2 w-80 bg-white ring-1 ring-stone-200 rounded-xl shadow-xl overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="text-[10px] tracking-wider text-stone-500 font-semibold mb-0.5">
              CONNECT A VENUE
            </div>
            <div className="text-sm text-stone-900">
              Plug in any book to trade or just track from one place.
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {VENUES.slice(0, 24).map((v) => (
              <Link
                key={v.id}
                href={
                  v.id === 'polymarket' ? '/dashboard/settings/autotrade' : '/dashboard/connections'
                }
                onClick={() => setPickerOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition"
              >
                <VenueIcon id={v.id} name={v.name} size={28} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-stone-900 truncate">{v.name}</span>
                  <span className="block text-[10px] text-stone-500 truncate">
                    {v.status === 'live' ? '✓ live' : v.status === 'coming_soon' ? 'soon' : 'requested'}
                  </span>
                </span>
                <span className="text-stone-400 text-xs">→</span>
              </Link>
            ))}
          </div>
          <Link
            href="/venues"
            onClick={() => setPickerOpen(false)}
            className="block px-4 py-2.5 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-stone-50 border-t border-stone-100 font-semibold"
          >
            See all venues →
          </Link>
        </div>
      )}
    </div>
  )
}

function venueAccent(id: string): string {
  switch (id) {
    case 'polymarket':
      return 'rgba(56, 189, 248, 0.15)'
    case 'kalshi':
      return 'rgba(16, 185, 129, 0.15)'
    case 'novig':
      return 'rgba(245, 158, 11, 0.15)'
    case 'prophetx':
      return 'rgba(139, 92, 246, 0.15)'
    case 'og_markets':
    case 'og':
      return 'rgba(244, 63, 94, 0.15)'
    default:
      return 'rgb(245, 245, 244)'
  }
}
