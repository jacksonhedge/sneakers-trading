import Link from 'next/link'
import { venuesByCategory, CATEGORY_LABELS, VENUES } from '@/lib/venues'
import { VenueCard } from './venue-card'

export const metadata = {
  title: 'Venues — Sneakers Terminal',
  description:
    'Every prediction market, sportsbook, DFS pick’em, and sweeps sportsbook Sneakers tracks.',
}

export default function VenuesPage() {
  const byCategory = venuesByCategory()
  const liveCount = VENUES.filter((v) => v.status === 'live').length
  const comingCount = VENUES.filter((v) => v.status === 'coming_soon').length
  const requestedCount = VENUES.filter(
    (v) => v.status === 'requested_frequently'
  ).length

  const categoryOrder: (keyof typeof byCategory)[] = [
    'prediction_market',
    'sportsbook',
    'dfs_pickem',
    'sweeps_social',
  ]

  return (
    <main className="min-h-screen bg-stone-950 text-white px-6 py-16 md:py-24">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 text-center">
          <Link
            href="/"
            className="text-xs text-emerald-300/80 tracking-wider hover:text-emerald-300"
          >
            ← SNEAKERS TERMINAL
          </Link>
          <h1 className="mt-6 text-3xl md:text-4xl font-bold">
            Every book, one terminal.
          </h1>
          <p className="mt-4 text-stone-400 max-w-2xl mx-auto text-sm md:text-base">
            Sneakers aggregates prices across prediction markets, sportsbooks,
            DFS pick’em, and sweeps operators. Click a live venue to head
            straight there — some links carry a Sneakers affiliate code so we
            earn a small share when you sign up. For venues not yet live,
            request early access and we’ll prioritize by demand.
          </p>
          <div className="mt-6 flex justify-center gap-6 text-xs tracking-wider">
            <span className="text-emerald-400">
              {liveCount} LIVE
            </span>
            <span className="text-amber-300">
              {comingCount} COMING SOON
            </span>
            <span className="text-stone-400">
              {requestedCount} IN QUEUE
            </span>
          </div>
        </div>

        <div className="space-y-12">
          {categoryOrder.map((cat) => (
            <section key={cat}>
              <div className="flex items-baseline justify-between border-b border-stone-800 pb-3 mb-5">
                <h2 className="text-lg font-semibold tracking-wide">
                  {CATEGORY_LABELS[cat]}
                </h2>
                <span className="text-xs text-stone-500">
                  {byCategory[cat].length} venues
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {byCategory[cat].map((v) => (
                  <VenueCard key={v.id} venue={v} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
