import Link from 'next/link'
import { getAllVenueAffiliateLinks, type VenueId } from '@/lib/venue-affiliate-links'
import { AffiliateRow } from './affiliate-row'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Venue affiliate links — Admin — Sneakers Terminal',
}

export default async function AffiliatesPage() {
  const links = await getAllVenueAffiliateLinks()
  const overriddenCount = links.filter((l) => l.isOverridden).length

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} VENUE AFFILIATE LINKS</div>
        <h1 className="text-2xl font-bold text-stone-900">
          {links.length}{' '}
          <span className="text-stone-500 text-base font-normal">
            venues · {overriddenCount} overridden
          </span>
        </h1>
        <p className="text-sm text-stone-600 mt-1 max-w-2xl">
          Per-venue sign-up URL + optional promo code. Surfaced in the Crypto Horse Race join modal's
          <em> Sign up via Sneakers</em> card. Save updates the URL the user lands on. RESET deletes the
          override row and reverts to the hardcoded default.
        </p>
        <p className="text-sm text-stone-500 mt-1 max-w-2xl">
          Edits are logged to the{' '}
          <Link href="/audit" className="text-[#00703c] underline">audit log</Link> with the prior values + actor.
          Lobby reads happen server-side per request, so changes show up immediately on the next page load.
        </p>
      </div>

      <div className="space-y-3">
        {links.map((l) => (
          <AffiliateRow
            key={l.venue}
            venue={l.venue as VenueId}
            initialUrl={l.signupUrl}
            initialCode={l.promoCode}
            updatedAt={l.updatedAt}
            updatedBy={l.updatedBy}
            isOverridden={l.isOverridden}
          />
        ))}
      </div>
    </div>
  )
}
