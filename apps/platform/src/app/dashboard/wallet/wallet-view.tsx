'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TransactionKind } from '@/lib/wallet'

// "Wimbledon Vault" — Sneakers Wallet, phase 1 scaffold. Data now flows in
// from the active WalletProvider (mock in dev / pre-KYB; MoonPay once env
// vars land). The visual direction is a deliberate break from the rest of
// the dashboard: deep emerald-noir surface, cream serif money, monospace
// ledger, brass accents. The point is that opening the wallet feels like
// walking into a different room — premium, intimate, financial.

// Display-layer txn shape. Server formats tsLabel before handing it down,
// so this client component doesn't need to deal with timezones. The
// canonical persistence shape (with occurredAt + status + vendorTxnId)
// lives in @/lib/wallet/types.
export interface WalletTransaction {
  id: string
  kind: TransactionKind
  label: string
  source: string
  amountCents: number // positive = inflow, negative = outflow
  tsLabel: string
}

const NOISE_BG =
  // Subtle fractal noise, ~2% opacity over the dark surface — feels printed,
  // not flat. Inlined SVG so no external asset to ship.
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")"

interface Props {
  balanceCents: number
  transactions: WalletTransaction[]
  serifClass: string
  monoClass: string
}

export function WalletView({
  balanceCents,
  transactions,
  serifClass,
  monoClass,
}: Props) {
  const [depositOpen, setDepositOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)

  // Split balance into dollars + cents so cents can render as a smaller
  // superscript — a small typographic move that's the difference between
  // "saas dashboard" and "private banking statement."
  const sign = balanceCents < 0 ? '-' : ''
  const abs = Math.abs(balanceCents)
  const dollars = Math.floor(abs / 100)
  const cents = (abs % 100).toString().padStart(2, '0')
  const dollarsFormatted = dollars.toLocaleString('en-US')

  return (
    <div className={monoClass}>
      <div
        className="relative -mx-6 sm:-mx-8 -my-6 sm:-my-10 min-h-[calc(100vh-4rem)] overflow-hidden"
        style={{
          background:
            'radial-gradient(120% 80% at 20% 0%, #1a3a28 0%, #0d1f17 55%, #08130d 100%)',
          color: '#f4ead5',
        }}
      >
        {/* Grain overlay — sells the printed feel. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
          style={{ backgroundImage: NOISE_BG, backgroundSize: '180px 180px' }}
        />
        {/* Soft brass vignette top-left — single light source. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full blur-[110px]"
          style={{ background: 'radial-gradient(circle, #c9a96e22 0%, transparent 70%)' }}
        />

        <div className="relative max-w-3xl mx-auto px-6 sm:px-10 py-10 sm:py-14">
          {/* Top eyebrow row — VAULT badge + back to dashboard */}
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="text-[10px] tracking-[0.25em] uppercase text-[#a89a7e] hover:text-[#f4ead5] transition"
            >
              ← Dashboard
            </Link>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#c9a96e' }}
              />
              <div
                className="text-[10px] tracking-[0.3em] uppercase"
                style={{ color: '#c9a96e' }}
              >
                Sneakers Vault
              </div>
            </div>
          </div>

          {/* Balance hero — the moment of the page. Serif, cream, brass $. */}
          <div className="mt-14 sm:mt-20">
            <div
              className="text-[10px] tracking-[0.3em] uppercase mb-3"
              style={{ color: '#a89a7e' }}
            >
              Your balance
            </div>
            <div className={`${serifClass} flex items-start gap-3 leading-none`}>
              <span
                className="text-3xl sm:text-4xl font-light pt-3 sm:pt-4 tabular-nums"
                style={{ color: '#c9a96e' }}
              >
                {sign}$
              </span>
              <span
                className="text-7xl sm:text-9xl font-medium tracking-tight tabular-nums"
                style={{ color: '#f4ead5' }}
              >
                {dollarsFormatted}
              </span>
              <span
                className="text-3xl sm:text-4xl font-light pt-3 sm:pt-4 tabular-nums"
                style={{ color: '#a89a7e' }}
              >
                .{cents}
              </span>
            </div>
            <div
              className="mt-4 text-[11px] tracking-wider"
              style={{ color: '#7a8c80' }}
            >
              Available — held in your Sneakers Vault, USD equivalent.
            </div>
          </div>

          {/* Action row — Deposit (filled, brass keyline) + Withdraw (ghost) */}
          <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 max-w-md">
            <VaultButton
              variant="filled"
              onClick={() => setDepositOpen(true)}
              icon="↓"
              label="Deposit"
              hint="From your bank or card"
            />
            <VaultButton
              variant="ghost"
              onClick={() => setWithdrawOpen(true)}
              icon="↑"
              label="Withdraw"
              hint="To your bank ••4421"
            />
          </div>

          {/* Ledger — recent activity */}
          <div className="mt-14 sm:mt-20">
            <div className="flex items-baseline justify-between mb-4">
              <div
                className="text-[10px] tracking-[0.3em] uppercase"
                style={{ color: '#a89a7e' }}
              >
                Recent activity
              </div>
              <div
                className="text-[10px] tracking-wider"
                style={{ color: '#7a8c80' }}
              >
                Last 7 days
              </div>
            </div>
            <div
              className="border-t"
              style={{ borderColor: '#27513a' }}
              aria-label="Transactions"
            >
              {transactions.map((t) => (
                <LedgerRow key={t.id} txn={t} />
              ))}
            </div>
            <div className="mt-5 text-right">
              <button
                type="button"
                disabled
                className="text-[10px] tracking-[0.25em] uppercase cursor-not-allowed"
                style={{ color: '#7a8c80' }}
              >
                View all →
              </button>
            </div>
          </div>

          {/* Scaffold notice — honest about the state, not hidden in dev */}
          <div
            className="mt-16 rounded border px-4 py-3 text-[11px] leading-relaxed"
            style={{
              borderColor: '#27513a',
              background: '#142a1e',
              color: '#a89a7e',
            }}
          >
            <span
              className="text-[10px] tracking-[0.25em] uppercase mr-2"
              style={{ color: '#c9a96e' }}
            >
              Phase 1 · Scaffold
            </span>
            Balance + activity above are sample data so we can walk the flow.
            CoinFlow integration ships next — same shapes, real money.
          </div>
        </div>

        {depositOpen && (
          <VaultModal
            title="Deposit to Vault"
            subtitle="Move funds from your bank or card into your Sneakers Vault. Settles via CoinFlow."
            kind="deposit"
            serifClass={serifClass}
            monoClass={monoClass}
            onClose={() => setDepositOpen(false)}
          />
        )}

        {withdrawOpen && (
          <VaultModal
            title="Withdraw from Vault"
            subtitle="Send funds from your Sneakers Vault to your linked bank. Settles via CoinFlow in 1–2 business days."
            kind="withdraw"
            serifClass={serifClass}
            monoClass={monoClass}
            onClose={() => setWithdrawOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

// ─── components ──────────────────────────────────────────────────────────

function VaultButton({
  variant,
  onClick,
  icon,
  label,
  hint,
}: {
  variant: 'filled' | 'ghost'
  onClick: () => void
  icon: string
  label: string
  hint: string
}) {
  const filled = variant === 'filled'
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative text-left rounded-lg px-5 py-4 transition-all duration-150 active:translate-y-px"
      style={{
        background: filled ? '#1c3829' : 'transparent',
        border: '1px solid',
        borderColor: filled ? '#c9a96e80' : '#27513a',
        boxShadow: filled
          ? 'inset 0 1px 0 rgba(244, 234, 213, 0.06), 0 8px 24px rgba(0, 0, 0, 0.35)'
          : 'none',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-base"
          style={{
            background: filled ? '#c9a96e' : 'transparent',
            color: filled ? '#0d1f17' : '#c9a96e',
            border: filled ? 'none' : '1px solid #c9a96e80',
          }}
          aria-hidden
        >
          {icon}
        </div>
        <div className="flex-1">
          <div className="text-base font-medium tracking-wide" style={{ color: '#f4ead5' }}>
            {label}
          </div>
          <div className="text-[10px] tracking-wider mt-0.5" style={{ color: '#7a8c80' }}>
            {hint}
          </div>
        </div>
      </div>
    </button>
  )
}

function LedgerRow({ txn }: { txn: WalletTransaction }) {
  const inflow = txn.amountCents > 0
  const abs = Math.abs(txn.amountCents)
  const formatted = `${(abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  const amountColor = inflow ? '#a8d4b9' : '#c9a96e'
  return (
    <div
      className="grid grid-cols-[1fr_auto] gap-4 items-baseline py-3 border-b"
      style={{ borderColor: '#1c3829' }}
    >
      <div className="min-w-0">
        <div className="text-[10px] tracking-[0.2em] uppercase" style={{ color: '#7a8c80' }}>
          {txn.tsLabel}
        </div>
        <div className="text-sm mt-0.5" style={{ color: '#f4ead5' }}>
          {txn.label}{' '}
          <span style={{ color: '#a89a7e' }}>· {txn.source}</span>
        </div>
      </div>
      <div
        className="text-base tabular-nums whitespace-nowrap"
        style={{ color: amountColor }}
      >
        {inflow ? '+' : '−'} ${formatted}
      </div>
    </div>
  )
}

function VaultModal({
  title,
  subtitle,
  kind,
  serifClass,
  monoClass,
  onClose,
}: {
  title: string
  subtitle: string
  kind: 'deposit' | 'withdraw'
  serifClass: string
  monoClass: string
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')

  // Lock body scroll while modal is open; restore on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Close on Escape — small thing, but expected on a financial modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={monoClass}
      style={{ position: 'fixed', inset: 0, zIndex: 50 }}
      onClick={onClose}
    >
      {/* Backdrop — dark and slightly blurred so the modal feels lifted off
          the surface, like opening a folder on a desk. */}
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-md"
        style={{ background: 'rgba(8, 19, 13, 0.78)' }}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vault-modal-title"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md rounded-2xl border overflow-hidden"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 0%, #1a3a28 0%, #0d1f17 70%, #08130d 100%)',
            borderColor: '#c9a96e80',
            boxShadow:
              '0 24px 72px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(244, 234, 213, 0.05)',
            color: '#f4ead5',
          }}
        >
          {/* Brass keyline along the top */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, #c9a96e 50%, transparent 100%)',
            }}
          />

          <div className="px-6 pt-6 pb-5">
            <div className="flex items-baseline justify-between mb-1">
              <div
                className="text-[10px] tracking-[0.3em] uppercase"
                style={{ color: '#c9a96e' }}
              >
                {kind === 'deposit' ? 'Inflow' : 'Outflow'}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-sm leading-none w-6 h-6 flex items-center justify-center rounded transition hover:bg-white/5"
                style={{ color: '#a89a7e' }}
              >
                ✕
              </button>
            </div>
            <h2
              id="vault-modal-title"
              className={`${serifClass} text-2xl font-medium tracking-tight`}
              style={{ color: '#f4ead5' }}
            >
              {title}
            </h2>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: '#a89a7e' }}>
              {subtitle}
            </p>
          </div>

          <div className="px-6 pb-6 space-y-5">
            {/* Amount input — large serif, brass $ */}
            <div>
              <div
                className="text-[10px] tracking-[0.25em] uppercase mb-2"
                style={{ color: '#7a8c80' }}
              >
                Amount
              </div>
              <div
                className="relative rounded-lg border px-4 py-3 flex items-baseline gap-2"
                style={{
                  borderColor: '#27513a',
                  background: '#0a1812',
                }}
              >
                <span
                  className={`${serifClass} text-2xl font-light tabular-nums`}
                  style={{ color: '#c9a96e' }}
                >
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${serifClass} bg-transparent w-full text-3xl font-medium tabular-nums focus:outline-none`}
                  style={{ color: '#f4ead5' }}
                />
              </div>
              <div className="mt-2 flex gap-2">
                {[25, 50, 100, 250].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(q.toString())}
                    className="text-[10px] tracking-wider px-2.5 py-1 rounded border transition hover:bg-white/5"
                    style={{ borderColor: '#27513a', color: '#a89a7e' }}
                  >
                    ${q}
                  </button>
                ))}
              </div>
            </div>

            {/* CoinFlow notice */}
            <div
              className="rounded border px-3 py-2.5 text-[11px] leading-relaxed"
              style={{ borderColor: '#27513a', background: '#142a1e', color: '#a89a7e' }}
            >
              <span
                className="text-[10px] tracking-[0.25em] uppercase mr-2"
                style={{ color: '#c9a96e' }}
              >
                CoinFlow
              </span>
              Coming soon. This is a scaffold — no funds will move yet.
            </div>

            {/* Primary action — disabled in scaffold */}
            <button
              type="button"
              disabled
              className="w-full rounded-lg py-3 text-sm font-medium tracking-wide cursor-not-allowed transition"
              style={{
                background: '#1c3829',
                color: '#7a8c80',
                border: '1px solid #27513a',
              }}
            >
              {kind === 'deposit' ? 'Continue to CoinFlow' : 'Review withdrawal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
