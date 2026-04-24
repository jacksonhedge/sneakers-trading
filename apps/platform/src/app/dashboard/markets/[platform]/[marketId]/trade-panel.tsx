'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Venue } from '@/lib/venues'

type Outcome = { name: string; price: number | null }

type Props = {
  outcomes: Outcome[]
  primaryVenue: Venue | undefined
}

export function TradePanel({ outcomes, primaryVenue }: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'pro'>('market')
  const [pickedIdx, setPickedIdx] = useState(0)
  const [amount, setAmount] = useState<number>(0)

  const picked = outcomes[pickedIdx]
  const price = picked?.price ?? null
  const toWin = price && price > 0 ? amount / price : 0
  const sliderPct = Math.min(100, Math.max(0, Math.round((amount / 1000) * 100)))

  const ctaLabel = primaryVenue?.affiliateUrl ? 'Enable Trading' : 'Coming soon'
  const ctaHref = primaryVenue?.affiliateUrl ?? '#'

  return (
    <aside
      data-stripe
      className="w-[340px] flex-shrink-0 bg-[var(--right-bg)] border-l border-[var(--border)] flex flex-col overflow-y-auto"
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block w-4 h-4 rounded-full bg-[var(--accent)] ring-1 ring-[var(--accent)]/30" />
            <span className="font-semibold text-[var(--text)]">Opinion</span>
            <span className="text-[var(--text-muted)]">▾</span>
          </div>
          <button className="text-[var(--text-muted)] hover:text-[var(--text-2)] text-xs" aria-label="collapse">
            ›
          </button>
        </div>

        <div className="grid grid-cols-2 border-b border-[var(--border)]">
          <button
            onClick={() => setSide('buy')}
            className={`pb-2 text-xs font-semibold tracking-wider transition ${
              side === 'buy'
                ? 'text-[var(--text)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
            }`}
          >
            BUY
          </button>
          <button
            onClick={() => setSide('sell')}
            className={`pb-2 text-xs font-semibold tracking-wider transition ${
              side === 'sell'
                ? 'text-[var(--text)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
            }`}
          >
            SELL
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs">
          {(['market', 'limit', 'pro'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`capitalize transition ${
                orderType === t
                  ? 'text-[var(--text)] font-semibold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-2)]'
              }`}
            >
              {t}
              {t === 'pro' && <span className="text-[var(--text-muted)] ml-0.5">▾</span>}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {outcomes.slice(0, 2).map((o, i) => {
            const isPicked = pickedIdx === i
            const isYes = i === 0
            const priceCents = o.price != null ? `${Math.round(o.price * 100)}¢` : '—'
            return (
              <button
                key={o.name + i}
                onClick={() => setPickedIdx(i)}
                className={`py-3 rounded text-sm font-semibold transition ${
                  isPicked
                    ? isYes
                      ? 'bg-[var(--yes-bg)] text-[var(--yes)] ring-1 ring-[var(--yes-ring)]'
                      : 'bg-[var(--no-bg)] text-[var(--no)] ring-1 ring-[var(--no-ring)]'
                    : 'bg-[var(--panel)] text-[var(--text-3)] ring-1 ring-[var(--border)] hover:ring-[var(--text-muted)]'
                }`}
              >
                <div className="text-[10px] tracking-wider text-[var(--text-muted)]">
                  {o.name.toUpperCase()}
                </div>
                <div className="mt-0.5 font-mono tabular-nums">{priceCents}</div>
              </button>
            )
          })}
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs text-[var(--text-muted)] tracking-wider">AMOUNT</span>
            <span className="text-2xl font-bold text-[var(--text)] font-mono tabular-nums">
              ${amount.toFixed(2)}
            </span>
          </div>
          <div className="relative h-6 flex items-center">
            <div className="absolute inset-x-0 h-1 bg-[var(--border)] rounded-full" />
            <div
              className="absolute left-0 h-1 bg-[var(--accent)] rounded-full"
              style={{ width: `${sliderPct}%` }}
            />
            <input
              type="range"
              min={0}
              max={1000}
              step={10}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Amount"
            />
            <div
              className="absolute w-4 h-4 rounded-full bg-[var(--panel)] ring-2 ring-[var(--accent)] pointer-events-none"
              style={{ left: `calc(${sliderPct}% - 8px)` }}
            />
          </div>
          <div className="flex justify-end mt-1">
            <span className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums">{sliderPct}%</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t border-[var(--border)] pt-3">
          <span className="text-xs text-[var(--text-muted)] tracking-wider">TO WIN</span>
          <span className="text-xl font-bold text-[var(--yes)] font-mono tabular-nums">
            ${toWin.toFixed(2)}
          </span>
        </div>

        <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          {primaryVenue
            ? `Setting up your ${primaryVenue.name} account…`
            : 'Venue link unavailable — trading not yet wired for this book.'}
        </div>

        {primaryVenue?.affiliateUrl ? (
          <a
            href={ctaHref}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="block text-center w-full py-2.5 text-sm font-semibold rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition"
          >
            {ctaLabel} →
          </a>
        ) : (
          <button
            disabled
            className="w-full py-2.5 text-sm font-semibold rounded bg-[var(--panel-2)] text-[var(--text-muted)] cursor-not-allowed"
          >
            {ctaLabel}
          </button>
        )}

        <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-xs pt-2 border-t border-[var(--border)]">
          <dt className="text-[var(--text-muted)]">Shares Value</dt>
          <dd className="text-[var(--text-2)] font-mono tabular-nums text-right">
            {price ? `${toWin.toFixed(1)} shares` : '—'}
          </dd>
          <dt className="text-[var(--text-muted)]">USD Value</dt>
          <dd className="text-[var(--text-2)] font-mono tabular-nums text-right">${amount.toFixed(2)}</dd>
          <dt className="text-[var(--text-muted)]">Avg. Price</dt>
          <dd className="text-[var(--text-2)] font-mono tabular-nums text-right">
            {price != null ? `${Math.round(price * 100)}¢` : '—'}
          </dd>
          <dt className="text-[var(--text-muted)] flex items-center gap-1">
            Fees
            <span className="text-[var(--text-muted)] text-[10px]">ⓘ</span>
          </dt>
          <dd className="text-[var(--text-2)] font-mono tabular-nums text-right">0/var</dd>
        </dl>
      </div>

      <div className="mt-auto p-4 border-t border-[var(--border)] space-y-3">
        <Link
          href="/dashboard/billing/credits"
          className="block text-center w-full py-2.5 text-sm font-semibold rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition"
        >
          Deposit
        </Link>
        <div className="grid grid-cols-2 gap-3">
          <button className="py-2 text-xs font-semibold rounded ring-1 ring-[var(--border)] text-[var(--text-2)] hover:bg-[var(--panel-2)] transition">
            Swap
          </button>
          <button className="py-2 text-xs font-semibold rounded ring-1 ring-[var(--no-ring)] text-[var(--no)] hover:bg-[var(--no-bg)] transition">
            Withdraw
          </button>
        </div>

        <div className="pt-3 border-t border-[var(--border)] space-y-2 text-xs">
          <div className="text-[10px] text-[var(--text-muted)] tracking-wider">ACCOUNT OVERVIEW</div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Cash</span>
            <span className="text-[var(--text-2)] font-mono tabular-nums">$0.00</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Portfolio</span>
            <span className="text-[var(--text-2)] font-mono tabular-nums">$0.00</span>
          </div>
        </div>

        <div className="pt-3 border-t border-[var(--border)] space-y-2 text-xs">
          <div className="text-[10px] text-[var(--text-muted)] tracking-wider">PORTFOLIO OVERVIEW</div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Portfolio Value</span>
            <span className="text-[var(--text-2)] font-mono tabular-nums">$0.00</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Total PnL</span>
            <span className="text-[var(--text-2)] font-mono tabular-nums">$0.00</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Cash</span>
            <span className="text-[var(--text-2)] font-mono tabular-nums">$0.00</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
