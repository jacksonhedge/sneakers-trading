'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { MarketPhase, MarketSort } from '@/lib/markets-data'
import type { TerminalCategory } from '@/lib/market-stats'

type Props = {
  platforms: string[]
  sports: string[]
  currentQuery: string
  currentPlatform: string
  currentSport: string
  currentCategory: string
  currentPhase: string
  currentSort: MarketSort
}

const CATEGORIES: Array<{ id: TerminalCategory; label: string }> = [
  { id: 'politics', label: 'Politics' },
  { id: 'economics', label: 'Economics' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'sports', label: 'Sports' },
  { id: 'tech', label: 'Tech' },
  { id: 'other', label: 'Other' },
]

const PHASES: Array<{ id: MarketPhase; label: string }> = [
  { id: 'live', label: 'Live' },
  { id: 'pre_game', label: 'Pre' },
  { id: 'opening', label: 'Opening' },
]

const SORTS: Array<{ id: MarketSort; label: string }> = [
  { id: 'volume', label: 'Volume' },
  { id: 'overround', label: 'Overround' },
  { id: 'resolves_at', label: 'Resolves soon' },
  { id: 'updated', label: 'Recently updated' },
]

export function FilterBar({
  platforms,
  sports,
  currentQuery,
  currentPlatform,
  currentSport,
  currentCategory,
  currentPhase,
  currentSort,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(currentQuery)
  const [pending, startTransition] = useTransition()

  function buildUrl(overrides: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString())
    // Reset to page 1 whenever a filter changes
    sp.delete('page')
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === '') sp.delete(k)
      else sp.set(k, v)
    }
    const qs = sp.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function go(overrides: Record<string, string | null>) {
    startTransition(() => {
      router.push(buildUrl(overrides))
    })
  }

  function chip(
    value: string,
    label: string,
    param: string,
    current: string,
  ) {
    const active = current === value
    return (
      <button
        key={`${param}:${value || 'all'}`}
        type="button"
        onClick={() => go({ [param]: active ? null : value })}
        className={`text-[10px] tracking-wider px-2.5 py-1 rounded-full ring-1 transition ${
          active
            ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/60'
            : 'ring-stone-700 text-stone-400 hover:ring-stone-500 hover:text-stone-200'
        }`}
      >
        {label.toUpperCase()}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          go({ q: q.trim() || null })
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player, team, question…"
          className="flex-1 bg-stone-950 ring-1 ring-stone-700 focus:ring-emerald-400/60 focus:outline-none px-3 py-2 text-sm text-white placeholder:text-stone-500 transition rounded"
        />
        <button
          type="submit"
          disabled={pending}
          className="ring-1 ring-emerald-400/60 bg-emerald-500/20 text-emerald-300 px-4 py-2 text-xs tracking-wider hover:bg-emerald-500/30 transition disabled:opacity-50 rounded"
        >
          {pending ? 'SEARCHING…' : 'SEARCH'}
        </button>
        {currentQuery && (
          <button
            type="button"
            onClick={() => {
              setQ('')
              go({ q: null })
            }}
            className="ring-1 ring-stone-700 text-stone-400 px-3 py-2 text-xs tracking-wider hover:text-stone-200 transition rounded"
          >
            CLEAR
          </button>
        )}
      </form>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] text-stone-500 tracking-wider pr-1">CATEGORY</span>
        {chip('', 'ALL', 'category', currentCategory)}
        {CATEGORIES.map((c) => chip(c.id, c.label, 'category', currentCategory))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] text-stone-500 tracking-wider pr-1">PHASE</span>
        {chip('', 'ALL', 'phase', currentPhase)}
        {PHASES.map((p) => chip(p.id, p.label, 'phase', currentPhase))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] text-stone-500 tracking-wider pr-1">PLATFORM</span>
        {chip('', 'ALL', 'platform', currentPlatform)}
        {platforms.map((p) => chip(p, p, 'platform', currentPlatform))}
      </div>

      {sports.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-stone-500 tracking-wider pr-1">SPORT</span>
          {chip('', 'ALL', 'sport', currentSport)}
          {sports.map((s) => chip(s, s, 'sport', currentSport))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] text-stone-500 tracking-wider pr-1">SORT</span>
        {SORTS.map((s) => chip(s.id, s.label, 'sort', currentSort))}
      </div>
    </div>
  )
}
