'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-auth'
import { getServerClient } from '@/lib/supabase-server'
import { logAdminAction } from '@/lib/admin-audit'
import { VENUE_IDS, type VenueId } from '@/lib/venue-affiliate-links'

type Result = { ok: boolean; message: string }

const PROMO_RE = /^[A-Za-z0-9_-]{2,32}$/

function parseInput(formData: FormData):
  | { venue: VenueId; signupUrl: string; promoCode: string | null }
  | { error: string } {
  const rawVenue = formData.get('venue')
  const rawUrl = formData.get('signup_url')
  const rawCode = formData.get('promo_code')

  if (typeof rawVenue !== 'string' || !(VENUE_IDS as readonly string[]).includes(rawVenue)) {
    return { error: 'invalid venue' }
  }
  if (typeof rawUrl !== 'string') {
    return { error: 'signup_url required' }
  }
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) return { error: 'signup_url required' }
  if (trimmedUrl.length > 2048) return { error: 'signup_url too long (max 2048 chars)' }
  // Must be http(s). Anything else (javascript:, data:, file:, mailto:)
  // would be a phishing/XSS surface since we open it in a new tab.
  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    return { error: 'signup_url must be a valid absolute URL' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'signup_url must be http(s)' }
  }

  let promoCode: string | null = null
  if (typeof rawCode === 'string' && rawCode.trim().length > 0) {
    const trimmedCode = rawCode.trim()
    if (!PROMO_RE.test(trimmedCode)) {
      return { error: 'promo_code: 2-32 chars, letters/digits/_/- only' }
    }
    promoCode = trimmedCode
  }

  return { venue: rawVenue as VenueId, signupUrl: trimmedUrl, promoCode }
}

/**
 * Upsert one venue's affiliate link. Same shape for create / update —
 * the table only ever has at most one row per venue.
 */
export async function upsertVenueAffiliateLinkAction(formData: FormData): Promise<Result> {
  const { email: actorEmail } = await requireAdmin()
  const parsed = parseInput(formData)
  if ('error' in parsed) return { ok: false, message: parsed.error }
  const { venue, signupUrl, promoCode } = parsed

  const admin = getServerClient()

  const { data: priorRow } = await admin
    .from('venue_affiliate_links')
    .select('signup_url, promo_code')
    .eq('venue', venue)
    .maybeSingle()

  const { error } = await admin.from('venue_affiliate_links').upsert(
    {
      venue,
      signup_url: signupUrl,
      promo_code: promoCode,
      updated_by: actorEmail,
    },
    { onConflict: 'venue' },
  )

  if (error) return { ok: false, message: `save failed: ${error.message}` }

  await logAdminAction({
    actor: actorEmail,
    action: 'set_venue_affiliate_link',
    targetKind: 'system',
    targetId: venue,
    metadata: {
      venue,
      new_url: signupUrl,
      new_code: promoCode,
      prior_url: priorRow?.signup_url ?? null,
      prior_code: priorRow?.promo_code ?? null,
    },
  })

  revalidatePath('/admin/affiliates')
  revalidatePath('/admin/audit')
  revalidatePath('/dashboard/horse-race')
  return { ok: true, message: `saved ${venue}` }
}

/**
 * Reset a venue back to its hardcoded default — deletes the override
 * row. The lobby will then read the default from VENUE_AFFILIATE_DEFAULTS.
 */
export async function resetVenueAffiliateLinkAction(formData: FormData): Promise<Result> {
  const { email: actorEmail } = await requireAdmin()
  const rawVenue = formData.get('venue')
  if (typeof rawVenue !== 'string' || !(VENUE_IDS as readonly string[]).includes(rawVenue)) {
    return { ok: false, message: 'invalid venue' }
  }
  const venue = rawVenue as VenueId

  const admin = getServerClient()

  const { data: priorRow } = await admin
    .from('venue_affiliate_links')
    .select('signup_url, promo_code')
    .eq('venue', venue)
    .maybeSingle()

  if (!priorRow) {
    return { ok: true, message: `${venue} already on default` }
  }

  const { error } = await admin
    .from('venue_affiliate_links')
    .delete()
    .eq('venue', venue)

  if (error) return { ok: false, message: `reset failed: ${error.message}` }

  await logAdminAction({
    actor: actorEmail,
    action: 'reset_venue_affiliate_link',
    targetKind: 'system',
    targetId: venue,
    metadata: {
      venue,
      prior_url: priorRow.signup_url,
      prior_code: priorRow.promo_code,
    },
  })

  revalidatePath('/admin/affiliates')
  revalidatePath('/admin/audit')
  revalidatePath('/dashboard/horse-race')
  return { ok: true, message: `${venue} reset to default` }
}
