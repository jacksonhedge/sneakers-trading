#!/usr/bin/env tsx
// Admin script: issue invite codes to a list of waitlist members.
//
// Usage (run from apps/platform):
//   pnpm admin:invite email1@example.com email2@example.com ...
//
// Behavior per email:
//   - Looks up the email in the waitlist table.
//   - Skips if no matching row (user must sign up for waitlist first).
//   - Skips if the row already has an invite_code set (use --force to re-issue).
//   - Generates a unique 8-char invite code, sets invite_code + invited_at.
//   - Sends an invite email via Resend with a one-click signup link.

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'

// Load .env.local explicitly (dotenv/config only reads .env).
loadEnv({ path: path.join(process.cwd(), '.env.local') })

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8
const MAX_ATTEMPTS = 10

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'
const WAITLIST_FROM_EMAIL =
  process.env.WAITLIST_FROM_EMAIL ?? 'Sneakers Terminal <onboarding@resend.dev>'

function randomCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const emails = args.filter((a) => !a.startsWith('--'))

  if (emails.length === 0) {
    console.error('usage: pnpm admin:invite <email1> <email2> ... [--force]')
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!resendKey) {
    console.error('missing RESEND_API_KEY — cannot send invite emails')
    process.exit(1)
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })
  const resend = new Resend(resendKey)

  for (const rawEmail of emails) {
    const email = rawEmail.toLowerCase().trim()
    console.log(`\n--- ${email} ---`)

    const { data: row, error: selectErr } = await admin
      .from('waitlist')
      .select('email, invite_code, invited_at')
      .eq('email', email)
      .maybeSingle()

    if (selectErr) {
      console.error(`  lookup error: ${selectErr.message}`)
      continue
    }
    if (!row) {
      console.warn('  not on waitlist — skipping')
      continue
    }
    if (row.invite_code && !force) {
      console.warn(`  already has code ${row.invite_code} (invited ${row.invited_at}) — use --force to re-issue`)
      continue
    }

    // Generate unique code
    let code: string | null = null
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const candidate = randomCode()
      const { data: existing } = await admin
        .from('waitlist')
        .select('invite_code')
        .eq('invite_code', candidate)
        .limit(1)
      if (!existing || existing.length === 0) {
        code = candidate
        break
      }
    }
    if (!code) {
      console.error('  failed to generate unique code')
      continue
    }

    const { error: updateErr } = await admin
      .from('waitlist')
      .update({
        invite_code: code,
        invited_at: new Date().toISOString(),
        invite_used_at: null,
      })
      .eq('email', email)
    if (updateErr) {
      console.error(`  update failed: ${updateErr.message}`)
      continue
    }

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

    const { error: sendErr } = await resend.emails.send({
      from: WAITLIST_FROM_EMAIL,
      to: email,
      subject,
      text,
      html,
    })

    if (sendErr) {
      console.error(`  send failed: ${JSON.stringify(sendErr)}`)
      continue
    }

    console.log(`  ✓ issued ${code} and emailed`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
