'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// Wallet hub button on the topbar. Shows the user's TOTAL aggregated
// USD balance across every connected venue (Polymarket + Kalshi + Opinion
// + future) directly in the navbar — fetched on mount + every 60s while
// the tab is visible. Tap to open the popover for per-venue breakdown
// + connect/manage links.
//
// Always displays a number — `$0.00` when no creds are wired up so the
// user has a constant reference, never an empty button.

type AggregateState =
  | { kind: 'loading' }
  | {
      kind: 'ready'
      totalCents: number
      byVenue: Array<{
        venue: string
        status: 'ok' | 'error' | 'unsupported' | 'no_credentials'
        cents?: number
        error?: string
      }>
    }
  | { kind: 'error'; message: string }

function formatBalance(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export function WalletButton() {
  const [open, setOpen] = useState(false)
  const [agg, setAgg] = useState<AggregateState>({ kind: 'loading' })
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Aggregate balance fetcher. Runs on mount, then every 60s while the
  // tab is visible. The /api/balance endpoint returns 0 + empty
  // byVenue when no creds are wired up, which we render as $0.00 — the
  // navbar always shows a number so the user has a reference point.
  useEffect(() => {
    let cancelled = false
    let interval: number | undefined

    async function load() {
      try {
        const r = await fetch('/api/balance', { cache: 'no-store' })
        const data = (await r.json().catch(() => ({}))) as {
          ok?: boolean
          totalCents?: number
          byVenue?: AggregateState extends { kind: 'ready'; byVenue: infer V } ? V : never
          error?: string
        }
        if (cancelled) return
        if (!r.ok || !data.ok || typeof data.totalCents !== 'number') {
          setAgg({ kind: 'error', message: data.error ?? `HTTP ${r.status}` })
          return
        }
        setAgg({
          kind: 'ready',
          totalCents: data.totalCents,
          byVenue: data.byVenue ?? [],
        })
      } catch (err) {
        if (cancelled) return
        setAgg({ kind: 'error', message: (err as Error).message })
      }
    }

    load()
    interval = window.setInterval(() => {
      if (!document.hidden) load()
    }, 60_000)

    return () => {
      cancelled = true
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [])

  // What the button text reads. Always show a number unless we're still
  // loading the very first response.
  const buttonLabel =
    agg.kind === 'ready'
      ? formatBalance(agg.totalCents)
      : agg.kind === 'error'
        ? '—'
        : '…'

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Wallet — balance ${buttonLabel}`}
        title="Wallet & payments"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300 hover:bg-emerald-100 hover:ring-emerald-400 transition text-xs font-semibold tabular-nums"
      >
        <span aria-hidden>💳</span>
        <span>{buttonLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          className="absolute right-0 top-full mt-2 w-72 bg-white ring-1 ring-stone-200 rounded-xl shadow-xl overflow-hidden z-50"
        >
          <div className="px-4 py-3 border-b border-stone-100">
            <div className="text-[10px] tracking-wider text-stone-500 font-semibold mb-0.5">
              WALLET & PAYMENTS
            </div>
            <BalanceRow state={agg} />
          </div>

          <div className="py-1">
            <Link
              href="/dashboard/connections"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-2.5 text-sm text-stone-800 hover:bg-stone-50 transition"
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden>🔑</span>
                {agg.kind === 'ready' && agg.byVenue.length > 0
                  ? 'Manage venue connections'
                  : 'Connect a venue'}
              </span>
              <span className="text-stone-400 text-xs">→</span>
            </Link>
            <Link
              href="/dashboard/billing/credits"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-2.5 text-sm text-stone-800 hover:bg-stone-50 transition"
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden>🪙</span>
                Buy O&apos;Toole credits
              </span>
              <span className="text-stone-400 text-xs">→</span>
            </Link>
            <Link
              href="/dashboard/billing"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-2.5 text-sm text-stone-800 hover:bg-stone-50 transition"
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden>📋</span>
                Manage subscription
              </span>
              <span className="text-stone-400 text-xs">→</span>
            </Link>
          </div>

          <div className="px-4 py-2 border-t border-stone-100 text-[10px] text-stone-400">
            Non-custodial — Sneakers never holds funds.
          </div>
        </div>
      )}
    </div>
  )
}

function BalanceRow({ state }: { state: AggregateState }) {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-stone-300 border-t-emerald-500 animate-spin" />
        <span>Checking balance…</span>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="text-sm text-red-700">
        <span className="font-semibold">Balance unavailable.</span>
        <div className="text-[11px] text-red-600/80 mt-0.5 truncate" title={state.message}>
          {state.message}
        </div>
      </div>
    )
  }
  // ready
  return (
    <div className="text-sm text-stone-900">
      <div className="text-[10px] tracking-wider text-stone-500 mb-0.5">TOTAL BALANCE</div>
      <div className="text-xl font-bold tabular-nums">{formatBalance(state.totalCents)}</div>
      {state.byVenue.length === 0 ? (
        <div className="text-[11px] text-stone-500 mt-1">
          No venues connected yet.
        </div>
      ) : (
        <div className="mt-1.5 space-y-0.5">
          {state.byVenue.map((row) => (
            <div
              key={row.venue}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="text-stone-600 capitalize">{row.venue}</span>
              <span
                className={
                  row.status === 'ok'
                    ? 'text-stone-900 font-mono tabular-nums'
                    : 'text-amber-700'
                }
              >
                {row.status === 'ok' && typeof row.cents === 'number'
                  ? formatBalance(row.cents)
                  : row.status === 'no_credentials'
                    ? 'not connected'
                    : 'unavailable'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
