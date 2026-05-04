import { Resend } from 'resend'

type WaitlistEmailInput = {
  to: string
  position: number
  referralCode: string
}

const FROM = process.env.WAITLIST_FROM_EMAIL ?? 'Sneakers Terminal <onboarding@resend.dev>'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

export async function sendWaitlistConfirmation({
  to,
  position,
  referralCode,
}: WaitlistEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set, skipping send', { to, position, referralCode })
    return
  }

  const resend = new Resend(apiKey)
  const referralUrl = `${SITE_URL}/r/${referralCode}`

  const subject = "You're on the Sneakers Terminal waitlist"
  const text = [
    '> Access requested.',
    '',
    `You're #${position} in the queue.`,
    '',
    'Lace em up — every referral moves you up the line:',
    '  • Direct signup via your link:   +5 positions',
    '  • They refer someone next:        +2 positions (2nd degree)',
    '',
    'Your link:',
    `  ${referralUrl}`,
    '',
    '— Sneakers Terminal',
    SITE_URL,
  ].join('\n')

  const html = `
<div style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; background: #000; color: #4ade80; padding: 32px; max-width: 560px; margin: 0 auto;">
  <div style="font-size: 11px; opacity: 0.5; margin-bottom: 16px; letter-spacing: 0.05em;">SNEAKERS TERMINAL / v0.0.1 / PRE-LAUNCH</div>
  <div style="font-size: 16px; margin-bottom: 8px;">&gt; Access requested.</div>
  <div style="font-size: 14px; color: #86efac; line-height: 1.6; margin-bottom: 24px;">
    You're <strong style="color: #4ade80;">#${position}</strong> in the queue.
  </div>

  <div style="border: 1px solid rgba(74, 222, 128, 0.4); background: rgba(74, 222, 128, 0.05); padding: 16px; margin-bottom: 24px;">
    <div style="font-size: 12px; color: #86efac; margin-bottom: 12px; line-height: 1.6;">
      Lace 'em up — every referral moves you up the line:
    </div>
    <div style="font-size: 12px; color: #86efac; line-height: 1.8; margin-bottom: 16px;">
      &nbsp;&nbsp;• Direct signup via your link: <strong style="color: #4ade80;">+5 positions</strong><br>
      &nbsp;&nbsp;• They refer someone next: <strong style="color: #4ade80;">+2 positions</strong> (2nd degree)
    </div>
    <div style="font-size: 12px; color: #86efac; margin-bottom: 8px;">Your link:</div>
    <a href="${referralUrl}" style="font-size: 13px; color: #4ade80; word-break: break-all; text-decoration: none; border: 1px solid rgba(74, 222, 128, 0.4); padding: 8px 12px; display: inline-block;">
      ${referralUrl}
    </a>
  </div>

  <div style="border-top: 1px solid rgba(74, 222, 128, 0.2); padding-top: 16px; font-size: 11px; opacity: 0.5;">
    — Sneakers Terminal
    <br>
    <a href="${SITE_URL}" style="color: #4ade80; text-decoration: none;">${SITE_URL.replace(/^https?:\/\//, '')}</a>
  </div>
</div>
`.trim()

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      text,
      html,
    })
    if (error) {
      console.error('[email] resend error', error)
    }
  } catch (err) {
    console.error('[email] send threw', err)
  }
}

type PasswordResetEmailInput = {
  to: string
  resetUrl: string
}

/**
 * Send a password-reset email. Mirrors sendMagicLinkEmail but with
 * recovery-flavored copy. URL is minted server-side via
 * admin.generateLink({ type: 'recovery' }) and delivered through Resend.
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: PasswordResetEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY unset — password reset for', to, ':', resetUrl)
    return
  }

  const resend = new Resend(apiKey)

  const subject = 'Reset your Sneakers Terminal password'
  const text = [
    '> Reset your password.',
    '',
    'Click the link below to set a new password.',
    'This link is single-use and expires in about an hour.',
    '',
    resetUrl,
    '',
    "If you didn't request a password reset, ignore this email — your account stays exactly as it was.",
    '',
    '— Sneakers Terminal',
    SITE_URL,
  ].join('\n')

  const html = `
<div style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; background: #fff; color: #1a1f2c; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb;">
  <div style="font-size: 11px; color: rgba(0,66,37,0.6); margin-bottom: 16px; letter-spacing: 0.05em;">SNEAKERS TERMINAL / PASSWORD RESET</div>
  <div style="font-size: 16px; color: #004225; margin-bottom: 8px; font-weight: 600;">&gt; Reset your password.</div>
  <div style="font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
    Click the button below to set a new password. The link is single-use and expires in about an hour.
  </div>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${resetUrl}" style="display: inline-block; background: #00703c; color: #ffffff; padding: 12px 32px; text-decoration: none; font-weight: 600; letter-spacing: 0.05em; border-radius: 9999px;">
      RESET PASSWORD →
    </a>
  </div>

  <div style="font-size: 11px; color: #9ca3af; word-break: break-all; margin-bottom: 24px;">
    Or paste this URL: ${resetUrl}
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af;">
    Didn't request this? Ignore the email — your account stays exactly as it was.
    <br><br>
    — Sneakers Terminal
  </div>
</div>
`.trim()

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    text,
    html,
  })
  if (error) {
    console.error('[email] password-reset send error', error)
    throw new Error(`resend error: ${JSON.stringify(error)}`)
  }
}

type MagicLinkEmailInput = {
  to: string
  magicLinkUrl: string
}

/**
 * Send a magic-link sign-in email. The URL is minted server-side via
 * admin.generateLink and delivered through Resend so we don't depend on
 * Supabase Auth's built-in SMTP.
 *
 * Throws if Resend errors — the route handler should catch and convert to
 * a 5xx so the client retries. Silently returns when RESEND_API_KEY is
 * unset (dev mode); the link is logged to the server console as a
 * fallback so devs can copy-paste it from the terminal.
 */
export async function sendMagicLinkEmail({
  to,
  magicLinkUrl,
}: MagicLinkEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY unset — magic link for', to, ':', magicLinkUrl)
    return
  }

  const resend = new Resend(apiKey)

  const subject = 'Your Sneakers Terminal sign-in link'
  const text = [
    '> Sign in.',
    '',
    'Click the link below to sign in to Sneakers Terminal.',
    'This link is single-use and expires in about an hour.',
    '',
    magicLinkUrl,
    '',
    "If you didn't request this, ignore the email — no account changes happen until you click.",
    '',
    '— Sneakers Terminal',
    SITE_URL,
  ].join('\n')

  const html = `
<div style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; background: #fff; color: #1a1f2c; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb;">
  <div style="font-size: 11px; color: rgba(0,66,37,0.6); margin-bottom: 16px; letter-spacing: 0.05em;">SNEAKERS TERMINAL / SIGN IN</div>
  <div style="font-size: 16px; color: #004225; margin-bottom: 8px; font-weight: 600;">&gt; Sign in.</div>
  <div style="font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
    Click the button below to sign in. The link is single-use and expires in about an hour.
  </div>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${magicLinkUrl}" style="display: inline-block; background: #00703c; color: #ffffff; padding: 12px 32px; text-decoration: none; font-weight: 600; letter-spacing: 0.05em;">
      SIGN IN →
    </a>
  </div>

  <div style="font-size: 11px; color: #9ca3af; word-break: break-all; margin-bottom: 24px;">
    Or paste this URL: ${magicLinkUrl}
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af;">
    Didn't request this? Ignore the email — nothing happens until you click.
    <br><br>
    — Sneakers Terminal
  </div>
</div>
`.trim()

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    text,
    html,
  })
  if (error) {
    console.error('[email] magic-link send error', error)
    throw new Error(`resend error: ${JSON.stringify(error)}`)
  }
}

type BroadcastInput = {
  to: string
  subject: string
  bodyText: string
  bodyHtml?: string | null
}

/**
 * Send a single broadcast email. The /admin/announcements composer calls
 * this once per recipient with a small delay between calls. We deliberately
 * avoid Resend's batch API for now — per-recipient calls give us per-email
 * outcome, and the composer caps recipients at 500 so the loop is cheap.
 */
export async function sendBroadcastEmail({
  to,
  subject,
  bodyText,
  bodyHtml,
}: BroadcastInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set, skipping broadcast send', { to, subject })
    return
  }
  const resend = new Resend(apiKey)
  const html =
    bodyHtml ??
    `<div style="font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #1a1f2c; line-height: 1.55; max-width: 560px; margin: 0 auto; padding: 24px;">${escapeHtml(
      bodyText,
    )
      .split('\n\n')
      .map((p) => `<p style="margin: 0 0 16px;">${p.replace(/\n/g, '<br>')}</p>`)
      .join('')}<div style="margin-top:24px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:11px; color:#6b7280;">Sneakers Terminal · <a href="${SITE_URL}" style="color:#00703c;">${SITE_URL.replace(/^https?:\/\//, '')}</a></div></div>`

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    text: bodyText,
    html,
  })
  if (error) {
    throw new Error(`resend error: ${JSON.stringify(error)}`)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type InviteEmailInput = {
  to: string
  code: string
}

export async function sendInviteEmail({ to, code }: InviteEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set, skipping invite send', { to, code })
    return
  }

  const resend = new Resend(apiKey)
  const signupUrl = `${SITE_URL}/signup?code=${code}`

  const subject = "You're off the Sneakers waitlist"
  const text = [
    '> Access granted.',
    '',
    'Welcome to Sneakers Terminal.',
    '',
    `Your one-time access code:   ${code}`,
    '',
    'Sign up in one click:',
    `  ${signupUrl}`,
    '',
    "The code is single-use. Once you sign in, it won't work again.",
    '',
    '— Sneakers Terminal',
    SITE_URL,
  ].join('\n')

  const html = `
<div style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; background: #fff; color: #1a1f2c; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb;">
  <div style="font-size: 11px; color: rgba(0,66,37,0.6); margin-bottom: 16px; letter-spacing: 0.05em;">SNEAKERS TERMINAL / ACCESS GRANTED</div>
  <div style="font-size: 16px; color: #004225; margin-bottom: 8px; font-weight: 600;">&gt; Welcome to Sneakers Terminal.</div>
  <div style="font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
    You're off the waitlist. Your one-time access code is below.
  </div>

  <div style="background: #f8f5ee; border: 1px solid rgba(0, 112, 60, 0.2); padding: 20px; text-align: center; margin-bottom: 24px;">
    <div style="font-size: 11px; color: #6b7280; letter-spacing: 0.15em; margin-bottom: 8px;">ACCESS CODE</div>
    <div style="font-size: 28px; font-weight: 700; color: #00703c; letter-spacing: 0.3em;">${code}</div>
  </div>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${signupUrl}" style="display: inline-block; background: #00703c; color: #ffffff; padding: 12px 32px; text-decoration: none; font-weight: 600; letter-spacing: 0.05em;">
      SIGN UP →
    </a>
  </div>

  <div style="font-size: 12px; color: #6b7280; line-height: 1.6; margin-bottom: 16px;">
    The link above pre-fills your code. Sign-in requires a magic link sent to this same email address.
    <br><br>
    This code is single-use. Once you sign in, it won't work again.
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af;">
    — Sneakers Terminal
    <br>
    <a href="${SITE_URL}" style="color: #00703c; text-decoration: none;">${SITE_URL.replace(/^https?:\/\//, '')}</a>
  </div>
</div>
`.trim()

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      text,
      html,
    })
    if (error) {
      console.error('[email] invite send error', error)
      throw new Error(`resend error: ${JSON.stringify(error)}`)
    }
  } catch (err) {
    console.error('[email] invite send threw', err)
    throw err
  }
}

// Sent when an admin clicks Approve in /admin/users on a waitlist row that
// already has a Supabase auth user attached (i.e. signed up via the new
// flow, not the legacy invite-code one). No code needed — they just need
// to come back to the site and they'll be let in.
export async function sendApprovedEmail({ to }: { to: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set, skipping approved send', { to })
    return
  }

  const resend = new Resend(apiKey)
  const dashboardUrl = `${SITE_URL}/dashboard`
  const subject = "You're in — Sneakers Terminal"

  const text = [
    '> Access granted.',
    '',
    "You're off the waitlist. Sign in and your dashboard is unlocked:",
    `  ${dashboardUrl}`,
    '',
    'Already signed in on another tab? Refresh and you\'re through.',
    '',
    '— Sneakers Terminal',
    SITE_URL,
  ].join('\n')

  const html = `
<div style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; background: #fff; color: #1a1f2c; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb;">
  <div style="font-size: 11px; color: rgba(0,66,37,0.6); margin-bottom: 16px; letter-spacing: 0.05em;">SNEAKERS TERMINAL / ACCESS GRANTED</div>
  <div style="font-size: 16px; color: #004225; margin-bottom: 8px; font-weight: 600;">&gt; You're in.</div>
  <div style="font-size: 14px; color: #374151; line-height: 1.6; margin-bottom: 24px;">
    You're off the Sneakers Terminal waitlist. Your dashboard is unlocked.
  </div>

  <div style="text-align: center; margin-bottom: 24px;">
    <a href="${dashboardUrl}" style="display: inline-block; background: #00703c; color: #ffffff; padding: 12px 32px; text-decoration: none; font-weight: 600; letter-spacing: 0.05em;">
      OPEN DASHBOARD →
    </a>
  </div>

  <div style="font-size: 12px; color: #6b7280; line-height: 1.6; margin-bottom: 16px;">
    Already signed in on another tab? Refresh and you're through. Otherwise sign in with the same email and you'll land straight on the dashboard.
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af;">
    — Sneakers Terminal
    <br>
    <a href="${SITE_URL}" style="color: #00703c; text-decoration: none;">${SITE_URL.replace(/^https?:\/\//, '')}</a>
  </div>
</div>
`.trim()

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      text,
      html,
    })
    if (error) {
      console.error('[email] approved send error', error)
      throw new Error(`resend error: ${JSON.stringify(error)}`)
    }
  } catch (err) {
    console.error('[email] approved send threw', err)
    throw err
  }
}
