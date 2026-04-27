'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type VenueOption = {
  id: string
  name: string
  status: 'live' | 'coming_soon' | 'requested_frequently'
  blurb?: string
}

export function PlatformsForm({
  venues,
  initialSelected,
}: {
  venues: VenueOption[]
  initialSelected: string[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/onboarding/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platforms_connected: [...selected],
        current_step: 'platforms',
      }),
    })
    if (!res.ok) {
      setBusy(false)
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setError(body.message ?? 'Something went wrong. Try again.')
      return
    }
    router.push('/onboarding/invite-friends')
    router.refresh()
  }

  const live = venues.filter((v) => v.status === 'live')
  const coming = venues.filter((v) => v.status !== 'live')

  return (
    <form onSubmit={submit} className="space-y-6">
      <Group label="LIVE — DATA AVAILABLE NOW" venues={live} selected={selected} onToggle={toggle} />
      {coming.length > 0 && (
        <Group
          label="COMING SOON — WE'LL NOTIFY YOU"
          venues={coming}
          selected={selected}
          onToggle={toggle}
          dim
        />
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50 tracking-wider"
        >
          {busy ? 'SAVING…' : `CONTINUE → (${selected.size} selected)`}
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected(new Set())
          }}
          className="text-[11px] text-white/55 hover:text-white/80 underline"
        >
          Clear all
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
          {'>'} {error}
        </div>
      )}
    </form>
  )
}

function Group({
  label,
  venues,
  selected,
  onToggle,
  dim,
}: {
  label: string
  venues: VenueOption[]
  selected: Set<string>
  onToggle: (id: string) => void
  dim?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.15em] text-emerald-300/70 font-semibold mb-2">
        {label}
      </div>
      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${dim ? 'opacity-75' : ''}`}>
        {venues.map((v) => {
          const active = selected.has(v.id)
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onToggle(v.id)}
              className={`text-left p-3 rounded border transition ${
                active
                  ? 'border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/40'
                  : 'border-white/20 bg-black/40 hover:border-white/40 hover:bg-black/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`text-sm font-semibold ${active ? 'text-emerald-300' : 'text-white'}`}
                >
                  {v.name}
                </span>
                <span
                  className={`text-[10px] leading-none mt-0.5 ${
                    active ? 'text-emerald-300' : 'text-white/30'
                  }`}
                  aria-hidden
                >
                  {active ? '●' : '○'}
                </span>
              </div>
              {v.blurb && (
                <div className="text-[10px] text-white/45 mt-0.5 leading-snug truncate">
                  {v.blurb}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
