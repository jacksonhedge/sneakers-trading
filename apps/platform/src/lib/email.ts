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
