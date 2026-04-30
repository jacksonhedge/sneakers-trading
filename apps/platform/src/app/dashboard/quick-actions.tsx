'use client'

import { useEffect, useRef, useState } from 'react'

// Quick-action chip row above the OToole prompt input. Lets the user
// adjust autotrade caps + kill switch with one click instead of typing
// "set my daily cap to $200" into the chat.
//
// Three popovers wired here:
//   - Autotrade ON / OFF toggle (kill switch)
//   - Daily cap setter ($50 / $100 / $200 / $500 / Custom)
//   - Per-trade cap setter ($10 / $25 / $50 / $100 / Custom)
//
// All state is loaded once on mount + after each chip action so the
// pill labels reflect current values. Server enforces caps & wraps the
// kill-switch + drafts-cancel logic; this is just thin UI.

interface Settings {
  perTradeCapUsd: number
  dailyCapUsd: number
  killSwitchActive: boolean
}

const DAILY_PRESETS = [50, 100, 200, 500]
const PER_TRADE_PRESETS = [10, 25, 50, 100]

export function QuickActions() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [open, setOpen] = useState<'kill' | 'daily' | 'pertrade' | null>(null)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  async function refresh() {
    try {
      const r = await fetch('/api/otoole/autotrade-settings', { cache: 'no-store' })
      const d = (await r.json().catch(() => null)) as Settings & { ok?: boolean } | null
      if (d?.ok) {
        setSettings({
          perTradeCapUsd: d.perTradeCapUsd,
          dailyCapUsd: d.dailyCapUsd,
          killSwitchActive: d.killSwitchActive,
        })
      }
    } catch {
      // network blip — leave previous state
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  // Close popover on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function toggleKillSwitch(active: boolean) {
    setBusy(true)
    try {
      await fetch('/api/otoole/kill-switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active, reason: active ? 'user toggled off' : null }),
      })
      await refresh()
    } finally {
      setBusy(false)
      setOpen(null)
    }
  }

  async function setCaps(updates: { perTradeCapUsd?: number; dailyCapUsd?: number }) {
    setBusy(true)
    try {
      await fetch('/api/otoole/autotrade-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(updates),
      })
      await refresh()
    } finally {
      setBusy(false)
      setOpen(null)
    }
  }

  // Display values fall back to defaults until the first fetch lands so
  // the chip row never looks empty.
  const dailyCap = settings?.dailyCapUsd ?? 200
  const perTradeCap = settings?.perTradeCapUsd ?? 50
  const autotradeOn = settings ? !settings.killSwitchActive : true

  return (
    <div className="px-4 pt-1 pb-1.5" ref={wrapRef}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Autotrade ON/OFF chip */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === 'kill' ? null : 'kill')}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 ring-1 transition ${
              autotradeOn
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-300 hover:bg-emerald-100'
                : 'bg-red-50 text-red-700 ring-red-300 hover:bg-red-100'
            } disabled:opacity-50`}
            title="Autotrade kill switch"
          >
            <span aria-hidden>{autotradeOn ? '🟢' : '🔴'}</span>
            <span>{autotradeOn ? 'AUTOTRADE ON' : 'AUTOTRADE OFF'}</span>
          </button>
          {open === 'kill' && (
            <Popover>
              <div className="text-[11px] text-stone-700 mb-2 leading-snug">
                When OFF, every co-pilot proposal is blocked at gate 1 and any
                pending drafts are cancelled.
              </div>
              <div className="flex gap-1.5">
                <PopoverChip
                  active={autotradeOn}
                  onClick={() => toggleKillSwitch(false)}
                >
                  🟢 ON
                </PopoverChip>
                <PopoverChip
                  active={!autotradeOn}
                  onClick={() => toggleKillSwitch(true)}
                >
                  🔴 OFF
                </PopoverChip>
              </div>
            </Popover>
          )}
        </div>

        {/* Daily cap chip */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === 'daily' ? null : 'daily')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 ring-1 ring-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            title="Daily cap (UTC)"
          >
            <span aria-hidden>💰</span>
            <span>Daily ${dailyCap}</span>
          </button>
          {open === 'daily' && (
            <Popover>
              <div className="text-[11px] text-stone-700 mb-2 leading-snug">
                Total $ that may execute per UTC day. Resets at midnight.
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {DAILY_PRESETS.map((v) => (
                  <PopoverChip
                    key={v}
                    active={v === dailyCap}
                    onClick={() => setCaps({ dailyCapUsd: v })}
                  >
                    ${v}
                  </PopoverChip>
                ))}
                <CustomInput
                  current={dailyCap}
                  presets={DAILY_PRESETS}
                  max={25_000}
                  onSet={(v) => setCaps({ dailyCapUsd: v })}
                />
              </div>
            </Popover>
          )}
        </div>

        {/* Per-trade cap chip */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === 'pertrade' ? null : 'pertrade')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 ring-1 ring-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            title="Single-trade cap"
          >
            <span aria-hidden>⚙️</span>
            <span>Per-trade ${perTradeCap}</span>
          </button>
          {open === 'pertrade' && (
            <Popover>
              <div className="text-[11px] text-stone-700 mb-2 leading-snug">
                Hard ceiling on any single co-pilot trade. Server refuses
                drafts above this even if the daily cap has room.
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {PER_TRADE_PRESETS.map((v) => (
                  <PopoverChip
                    key={v}
                    active={v === perTradeCap}
                    onClick={() => setCaps({ perTradeCapUsd: v })}
                  >
                    ${v}
                  </PopoverChip>
                ))}
                <CustomInput
                  current={perTradeCap}
                  presets={PER_TRADE_PRESETS}
                  max={5_000}
                  onSet={(v) => setCaps({ perTradeCapUsd: v })}
                />
              </div>
            </Popover>
          )}
        </div>
      </div>
    </div>
  )
}

function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      className="absolute left-0 bottom-full mb-2 w-72 bg-white ring-1 ring-stone-200 rounded-xl shadow-xl p-3 z-50"
    >
      {children}
    </div>
  )
}

function PopoverChip({
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
      className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ring-1 transition ${
        active
          ? 'bg-stone-900 text-white ring-stone-900'
          : 'bg-white text-stone-700 ring-stone-300 hover:ring-stone-500 hover:bg-stone-50'
      }`}
    >
      {children}
    </button>
  )
}

function CustomInput({
  current,
  presets,
  max,
  onSet,
}: {
  current: number
  presets: number[]
  max: number
  onSet: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState<string>(String(current))

  if (!editing) {
    const isCustom = !presets.includes(current)
    return (
      <button
        type="button"
        onClick={() => {
          setVal(String(current))
          setEditing(true)
        }}
        className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ring-1 transition ${
          isCustom
            ? 'bg-stone-900 text-white ring-stone-900'
            : 'bg-white text-stone-700 ring-stone-300 hover:ring-stone-500 hover:bg-stone-50'
        }`}
      >
        Custom…
      </button>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const n = parseFloat(val)
        if (!Number.isFinite(n) || n <= 0 || n > max) {
          setEditing(false)
          return
        }
        onSet(Math.round(n))
      }}
      className="inline-flex items-center gap-1"
    >
      <span className="text-stone-600 text-[11px]">$</span>
      <input
        autoFocus
        type="number"
        min={1}
        max={max}
        step={1}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => setEditing(false)}
        className="w-16 text-[11px] font-mono ring-1 ring-stone-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-emerald-400"
      />
      <button
        type="submit"
        className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
      >
        SET
      </button>
    </form>
  )
}
