import { Resend } from 'resend'

type WaitlistEmailInput = {
  to: string
  position: number
}

const FROM = process.env.WAITLIST_FROM_EMAIL ?? 'Sneakers Terminal <onboarding@resend.dev>'

export async function sendWaitlistConfirmation({ to, position }: WaitlistEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set, skipping send', { to, position })
    return
  }

  const resend = new Resend(apiKey)

  const subject = "You're on the Sneakers Terminal waitlist"
  const text = [
    '> Access requested.',
    '',
    `You're #${position} in the queue. We'll be in touch before launch.`,
    '',
    '— Sneakers Terminal',
    'https://sneakersterminal.com',
  ].join('\n')

  const html = `
<div style="font-family: ui-monospace, 'SF Mono', Menlo, monospace; background: #000; color: #4ade80; padding: 32px; max-width: 560px; margin: 0 auto;">
  <div style="font-size: 11px; opacity: 0.5; margin-bottom: 16px;">SNEAKERS TERMINAL / v0.0.1 / PRE-LAUNCH</div>
  <div style="font-size: 16px; margin-bottom: 24px;">&gt; Access requested.</div>
  <div style="font-size: 14px; color: #86efac; line-height: 1.6; margin-bottom: 24px;">
    You're <strong style="color: #4ade80;">#${position}</strong> in the queue. We'll be in touch before launch.
  </div>
  <div style="border-top: 1px solid rgba(74, 222, 128, 0.2); padding-top: 16px; font-size: 11px; opacity: 0.5;">
    <a href="https://sneakersterminal.com" style="color: #4ade80; text-decoration: none;">sneakersterminal.com</a>
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
