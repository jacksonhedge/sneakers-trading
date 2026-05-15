import { redirect } from 'next/navigation'
import { Fraunces, Geist_Mono } from 'next/font/google'
import { getAuthClient } from '@/lib/supabase-auth'
import { getWalletProvider } from '@/lib/wallet'
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

export const dynamic = 'force-dynamic'

// Format an ISO timestamp into the wallet's "Today · 1:47 AM" / "Yesterday
// · 9:14 PM" / "May 13 · 4:33 PM" style. Forced into America/New_York
// because (a) serverless runs in UTC by default so "today" relative to the
// server is wrong for our audience, and (b) Sneakers' audience is US/college
// — eastern is a reasonable single-tz approximation until we plumb per-user
// timezone. Phase 2 fixes this with user-tz from the session.
const TZ = 'America/New_York'

function startOfDayInTz(d: Date): number {
  const dateStr = d.toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
  return new Date(`${dateStr}T00:00:00Z`).getTime()
}

function formatTsLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const dDay = startOfDayInTz(d)
  const today = startOfDayInTz(now)
  const yesterday = today - 24 * 60 * 60 * 1000

  const time = d.toLocaleTimeString('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
  })

  if (dDay === today) return `Today · ${time}`
  if (dDay === yesterday) return `Yesterday · ${time}`

  const date = d.toLocaleDateString('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
  })
  return `${date} · ${time}`
}

export default async function WalletPage() {
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/signup?next=/dashboard/wallet')

  const provider = getWalletProvider()

  const [balance, txns] = await Promise.all([
    provider.getBalance(user.id),
    provider.listTransactions(user.id, { limit: 5 }),
  ])

  // Map provider's canonical shape to the view's display shape. The
  // server formats tsLabel here so the client component doesn't need to
  // care about timezones (avoids the SSR/hydration mismatch).
  const viewTxns: WalletTransaction[] = txns.map((t) => ({
    id: t.id,
    kind: t.kind,
    label: t.label,
    source: t.source,
    amountCents: t.amountCents,
    tsLabel: formatTsLabel(t.occurredAt),
  }))

  return (
    <WalletView
      balanceCents={balance.amountCents}
      transactions={viewTxns}
      serifClass={fraunces.className}
      monoClass={ledgerMono.className}
    />
  )
}
