import { getServerClient } from './supabase-server'

// Venue affiliate links reader.
//
// Reads per-venue sign-up URLs (and optional promo codes) from
// public.venue_affiliate_links (migration 041). Falls back to the
// hardcoded VENUE_AFFILIATE_DEFAULTS when a row doesn't exist or the
// DB read fails. Callers treat defaults as source of truth — the
// table is the override surface, edited from /admin/affiliates.
//
// Server-side only (uses service-role client). Client components that
// need links get them via props from a server component (the dashboard
// horse-race page is the only caller today).

export const VENUE_IDS = [
  'polymarket',
  'limitless',
  'og',
  'hyperliquid',
  'kalshi',
] as const
export type VenueId = (typeof VENUE_IDS)[number]

export const VENUE_LABEL: Record<VenueId, string> = {
  polymarket: 'Polymarket',
  limitless: 'Limitless',
  og: 'OG',
  hyperliquid: 'Hyperliquid',
  kalshi: 'Kalshi',
}

// Hardcoded defaults that mirror what the lobby has used since the
// modal first shipped. Per memory, OG uses ?ref=WINDAILY (the user's
// existing affiliate code there); the others use ?ref=SNEAKERS.
export const VENUE_AFFILIATE_DEFAULTS: Record<VenueId, { signupUrl: string; promoCode: string | null }> = {
  polymarket: { signupUrl: 'https://polymarket.com/?ref=SNEAKERS', promoCode: null },
  limitless: { signupUrl: 'https://limitless.exchange/?ref=SNEAKERS', promoCode: null },
  og: { signupUrl: 'https://og.markets/?ref=WINDAILY', promoCode: 'WINDAILY' },
  hyperliquid: { signupUrl: 'https://app.hyperliquid.xyz/?ref=SNEAKERS', promoCode: null },
  kalshi: { signupUrl: 'https://kalshi.com/signup?referral=SNEAKERS', promoCode: null },
}

export type VenueAffiliateLink = {
  venue: VenueId
  signupUrl: string
  promoCode: string | null
  updatedAt: string | null
  updatedBy: string | null
  isOverridden: boolean
}

export type VenueAffiliateRow = {
  venue: string
  signup_url: string
  promo_code: string | null
  updated_at: string
  updated_by: string | null
}

/**
 * Returns one entry per venue, with DB overrides applied where present
 * and hardcoded defaults filling the gap. Always returns all five
 * venues so the admin UI can render an editable row for each.
 */
export async function getAllVenueAffiliateLinks(): Promise<VenueAffiliateLink[]> {
  let rows: VenueAffiliateRow[] = []
  try {
    const admin = getServerClient()
    const { data, error } = await admin
      .from('venue_affiliate_links')
      .select('venue, signup_url, promo_code, updated_at, updated_by')
    if (error) {
      console.warn('[venue-affiliate-links] read failed', error.message)
    } else {
      rows = (data ?? []) as VenueAffiliateRow[]
    }
  } catch (e) {
    console.warn('[venue-affiliate-links] unexpected', e instanceof Error ? e.message : e)
  }

  const byVenue = new Map<string, VenueAffiliateRow>()
  for (const r of rows) byVenue.set(r.venue, r)

  return VENUE_IDS.map((venue) => {
    const row = byVenue.get(venue)
    const defaults = VENUE_AFFILIATE_DEFAULTS[venue]
    if (!row) {
      return {
        venue,
        signupUrl: defaults.signupUrl,
        promoCode: defaults.promoCode,
        updatedAt: null,
        updatedBy: null,
        isOverridden: false,
      }
    }
    return {
      venue,
      signupUrl: row.signup_url,
      promoCode: row.promo_code,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
      isOverridden: true,
    }
  })
}

/**
 * Compact per-venue map for the dashboard surfaces — strip the audit
 * fields the consumer surfaces don't need. Used by horse-race-lobby
 * to inject overrides into VENUE_INFO without leaking admin metadata.
 */
export type VenueAffiliateLinkPublic = { signupUrl: string; promoCode: string | null }

export async function getVenueAffiliateLinkMap(): Promise<Record<VenueId, VenueAffiliateLinkPublic>> {
  const all = await getAllVenueAffiliateLinks()
  const out = {} as Record<VenueId, VenueAffiliateLinkPublic>
  for (const l of all) {
    out[l.venue] = { signupUrl: l.signupUrl, promoCode: l.promoCode }
  }
  return out
}
