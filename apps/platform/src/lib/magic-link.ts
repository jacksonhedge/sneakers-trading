import { getServerClient } from './supabase-server'
import { sendMagicLinkEmail } from './email'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

/**
 * Mint a Supabase magic-link URL server-side and email it to the address
 * via Resend. Replaces the previous signInWithOtp pattern, which depends on
 * Supabase Auth's built-in SMTP being wired to a real email provider.
 *
 * Returns { ok, devLink? } — devLink is ONLY populated when
 * AUTH_DEV_RETURN_LINK=1 is set in the environment, used for testing the
 * auth flow without requiring email delivery. Never set this in prod.
 *
 * The action_link is a short-lived single-use URL; if leaked it grants
 * full session access, so production code MUST NOT include devLink in
 * any user-visible response or log.
 */
export async function mintAndSendMagicLink({
  email,
  next,
}: {
  email: string
  next: string
}): Promise<{ ok: true; devLink?: string } | { ok: false; reason: string }> {
  const admin = getServerClient()

  // generateLink with type='magiclink' creates the auth.users row
  // idempotently (existing users get a fresh link, new users are
  // created with email_confirm=true so the link is the verification).
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })
  if (error || !data?.properties?.action_link) {
    console.error('[magic-link] generateLink failed', error)
    return { ok: false, reason: 'generate_link_failed' }
  }

  const actionLink = data.properties.action_link

  try {
    await sendMagicLinkEmail({ to: email, magicLinkUrl: actionLink })
  } catch (err) {
    console.error('[magic-link] send failed', err)
    return { ok: false, reason: 'send_failed' }
  }

  if (process.env.AUTH_DEV_RETURN_LINK === '1') {
    return { ok: true, devLink: actionLink }
  }
  return { ok: true }
}
