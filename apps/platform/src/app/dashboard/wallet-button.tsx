'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// Wallet hub button on the topbar. Lazy-fetches the user's Polymarket
// USDC balance the first time the popover opens so we don't pay a
// venue round-trip on every dashboard render. Quick links to the three
// money paths the user might want from any dashboard page:
//   - Polymarket balance + connect / manage
//   - Buy O'Toole credits (Stripe checkout)
//   - Manage subscription (billing portal)
//
// No embedded-wallet vendor decision baked in here — when one lands
// (Privy / Dynamic / Coinbase / etc.) it can plug in as another row.

type BalanceState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'connected'; usdcCents: number }
  | { kind: 'no_creds' }
  | { kind: 'error'; message: string }

export function WalletButton() {
  const [open, setOpen] = useState(false)
  const [balance, setBalance] = useState<BalanceState>({ kind: 'idle' })
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

  // Load balance the first time the popover opens. Re-fetches on
  // subsequent opens too so the user sees fresh USDC after a deposit.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setBalance({ kind: 'loading' })
    fetch('/api/autotrade/balance', { cache: 'no-store' })
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as {
          ok?: boolean
          usdcCents?: number
          error?: string
          message?: string
        }
        if (cancelled) return
        if (r.status === 404 || data.error === 'no_credentials') {
          setBalance({ kind: 'no_creds' })
          return
        }
        if (!r.ok || !data.ok || typeof data.usdcCents !== 'number') {
          setBalance({ kind: 'error', message: data.message ?? `HTTP ${r.status}` })
          return
        }
        setBalance({ kind: 'connected', usdcCents: data.usdcCents })
      })
      .catch((err) => {
        if (cancelled) return
        setBalance({ kind: 'error', message: (err as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Wallet"
        title="Wallet & payments"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300 hover:bg-emerald-100 hover:ring-emerald-400 transition text-xs font-semibold"
      >
        <span aria-hidden>💳</span>
        <span className="hidden sm:inline">Wallet</span>
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
            <BalanceRow state={balance} />
          </div>

          <div className="py-1">
            <Link
              href="/dashboard/settings/autotrade"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between px-4 py-2.5 text-sm text-stone-800 hover:bg-stone-50 transition"
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden>🔑</span>
                {balance.kind === 'connected'
                  ? 'Manage Polymarket connection'
                  : 'Connect Polymarket'}
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

function BalanceRow({ state }: { state: BalanceState }) {
  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-stone-300 border-t-emerald-500 animate-spin" />
        <span>Checking balance…</span>
      </div>
    )
  }
  if (state.kind === 'no_creds') {
    return (
      <div className="text-sm text-stone-700">
        <span className="font-semibold">Polymarket not connected.</span>
        <div className="text-[11px] text-stone-500 mt-0.5">
          Paste your CLOB keys + funder address to enable trading.
        </div>
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
  const dollars = (state.usdcCents / 100).toFixed(2)
  return (
    <div className="text-sm text-stone-900">
      <div className="text-[10px] tracking-wider text-stone-500 mb-0.5">POLYMARKET USDC</div>
      <div className="text-xl font-bold tabular-nums">${dollars}</div>
    </div>
  )
}
