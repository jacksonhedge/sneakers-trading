// Signup feature flags. Single source of truth for whether each signup path
// is open. Read at server-render time AND validated server-side in
// /api/waitlist so disabled paths can't be bypassed via direct POST.
//
// Env vars (NEXT_PUBLIC_ so they're readable from server components without
// extra config; values are the literal strings "0" / "false" / "off" to
// disable, anything else (or unset) is enabled — open by default):
//
//   NEXT_PUBLIC_SIGNUP_INDIVIDUAL_ENABLED  default: enabled
//   NEXT_PUBLIC_SIGNUP_ORG_ENABLED         default: enabled
//   NEXT_PUBLIC_SIGNUP_BANNER              optional banner text shown on
//                                          landing when at least one path
//                                          is disabled OR when set
//                                          regardless. Empty = no banner.
//
// To pause Organization signups for a week without a deploy:
//   vercel env add NEXT_PUBLIC_SIGNUP_ORG_ENABLED=0
//   vercel env add NEXT_PUBLIC_SIGNUP_BANNER="Org signups paused — back next Monday."

const FALSY = new Set(['0', 'false', 'off', 'disabled', 'no'])

function isEnabled(envValue: string | undefined): boolean {
  if (!envValue) return true
  return !FALSY.has(envValue.trim().toLowerCase())
}

export interface SignupConfig {
  individualEnabled: boolean
  organizationEnabled: boolean
  banner: string | null
  /** True when ALL signup paths are disabled. Render a "we're paused" surface. */
  allClosed: boolean
}

export function getSignupConfig(): SignupConfig {
  const individualEnabled = isEnabled(process.env.NEXT_PUBLIC_SIGNUP_INDIVIDUAL_ENABLED)
  const organizationEnabled = isEnabled(process.env.NEXT_PUBLIC_SIGNUP_ORG_ENABLED)
  const rawBanner = process.env.NEXT_PUBLIC_SIGNUP_BANNER
  const banner = rawBanner && rawBanner.trim().length > 0 ? rawBanner.trim() : null

  return {
    individualEnabled,
    organizationEnabled,
    banner,
    allClosed: !individualEnabled && !organizationEnabled,
  }
}

/**
 * Server-side gate for /api/waitlist. Returns null when the requested
 * accountType is allowed; returns an error code when the path is disabled.
 */
export function checkSignupAllowed(
  accountType: 'individual' | 'business',
): { ok: true } | { ok: false; error: 'individual_signups_paused' | 'org_signups_paused' } {
  const cfg = getSignupConfig()
  if (accountType === 'individual' && !cfg.individualEnabled) {
    return { ok: false, error: 'individual_signups_paused' }
  }
  if (accountType === 'business' && !cfg.organizationEnabled) {
    return { ok: false, error: 'org_signups_paused' }
  }
  return { ok: true }
}
