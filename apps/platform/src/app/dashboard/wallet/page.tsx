import { Fraunces, Geist_Mono } from 'next/font/google'
import { WalletView, type WalletTransaction } from './wallet-view'

// Typography is the whole personality of this surface. The wallet is a
// different "room" in the Sneakers house — serif headlines + monospace
// ledger + cream-on-emerald-noir is what makes it read as a premium
// financial product instead of another Tailwind dashboard. Both fonts are
// scoped to this route (loaded once, applied via className), so the rest
// of the app is unaffected.

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  // Slightly tighter axis — Fraunces' display weights at higher optical
  // sizes have the right "paper-feel" gravitas without being stuffy.
  axes: ['opsz', 'SOFT', 'WONK'],
})

const ledgerMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
})

export const metadata = {
  title: 'Wallet — Sneakers Terminal',
}

// Phase 1 is scaffold-only — mock balance, mock activity, stubbed
// Deposit/Withdraw flows. Phase 1.5 swaps in the CoinFlow integration
// once API keys + sandbox are ready. The shape here (balance in cents +
// transactions as a flat list) is what the real WalletProvider will fill.

const MOCK_BALANCE_CENTS = 124732 // $1,247.32

const MOCK_TRANSACTIONS: WalletTransaction[] = [
  {
    id: 't1',
    kind: 'deposit',
    label: 'Deposit',
    source: 'CoinFlow',
    amountCents: 25000,
    tsLabel: 'Today · 1:47 AM',
  },
  {
    id: 't2',
    kind: 'trade_settle',
    label: 'Trade settle',
    source: 'Kalshi',
    amountCents: 1840,
    tsLabel: 'Today · 12:08 AM',
  },
  {
    id: 't3',
    kind: 'withdraw',
    label: 'Withdraw',
    source: 'Bank ••4421',
    amountCents: -10000,
    tsLabel: 'Yesterday · 9:14 PM',
  },
  {
    id: 't4',
    kind: 'trade_buy',
    label: 'Trade buy',
    source: 'Polymarket',
    amountCents: -5000,
    tsLabel: 'May 13 · 4:33 PM',
  },
  {
    id: 't5',
    kind: 'deposit',
    label: 'Deposit',
    source: 'CoinFlow',
    amountCents: 50000,
    tsLabel: 'May 13 · 11:02 AM',
  },
]

export default function WalletPage() {
  return (
    <WalletView
      balanceCents={MOCK_BALANCE_CENTS}
      transactions={MOCK_TRANSACTIONS}
      serifClass={fraunces.className}
      monoClass={ledgerMono.className}
    />
  )
}
