'use client'

import { useState } from 'react'

// Open signup form. Anyone with an email can sign up:
//   - If ACCESS CODE is filled → existing waitlist invite flow (validates
//     the code against the user's waitlist row).
//   - If ACCESS CODE is empty → open path: server bookkeeps the waitlist
//     row and triggers a magic-link email.
//
// Either way the magic link is delivered by email (Supabase OTP). The user
// clicks it from their inbox → /auth/callback sets the session → /dashboard.
// We never return the link in the response — that would be account-takeover-
// by-email-enumeration.

function isEduEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.includes('@')) return false
  return /@([a-z0-9-]+\.)*edu(\.[a-z]{2,3})?$/.test(trimmed)
}

export function SignupForm({
  initialCode,
}: {
  initialCode?: string
  referralCode?: string | null
}) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(initialCode ?? '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const hasCode = code.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg(null)

    const payload: { email: string; code?: string } = {
      email: email.trim().toLowerCase(),
    }
    if (hasCode) payload.code = code.trim().toUpperCase()

    const res = await fetch('/api/auth/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      status?: string
    }
    if (res.ok && json.ok) {
      setStatus('sent')
      return
    }

    setStatus('error')
    if (json.error === 'invite_invalid')
      setErrorMsg('That code is invalid, already used, or not for this email.')
    else if (json.error === 'invalid_email') setErrorMsg('Check the email address.')
    else if (json.error === 'invalid_code') setErrorMsg('Code must be 8 characters.')
    else setErrorMsg('Something went wrong. Try again in a moment.')
  }

  if (status === 'sent') {
    return (
      <div className="space-y-3">
        <div className="border border-emerald-400/60 bg-emerald-400/10 text-emerald-200 px-4 py-4 rounded">
          <div className="text-xs tracking-wider font-semibold mb-1">
            ✓ MAGIC LINK SENT
          </div>
          <div className="text-sm leading-relaxed">
            Check <span className="font-mono">{email.trim().toLowerCase()}</span> for
            a sign-in link. Click it from the same browser to land on your dashboard.
          </div>
        </div>
        <div className="text-[11px] text-white/55 text-center leading-relaxed">
          Don&apos;t see it? Check spam, or wait a minute and try again.
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-[11px] tracking-wider text-emerald-300/80 mb-1">
          EMAIL <span className="text-white/40 normal-case">(.edu preferred)</span>
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.edu"
          autoComplete="email"
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 rounded focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
        />
        {isEduEmail(email) && (
          <div className="text-[10px] text-emerald-300/90 mt-1.5 tracking-wider">
            ✓ .edu detected — 75% off + leaderboard access unlocked after verification
          </div>
        )}
      </div>

      <div>
        <label className="block text-[11px] tracking-wider text-emerald-300/80 mb-1">
          ACCESS CODE <span className="text-white/40 normal-case">(optional)</span>
        </label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXXXXXX"
          maxLength={8}
          spellCheck={false}
          autoCapitalize="characters"
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 rounded focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/30 tracking-[0.3em] font-semibold transition"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 transition disabled:opacity-50 tracking-wider"
      >
        {status === 'loading' ? 'SENDING…' : 'SEND MAGIC LINK →'}
      </button>

      <div className="text-[11px] text-white/55 text-center leading-relaxed">
        {hasCode
          ? 'We\'ll email a sign-in link to that address — click it to land on the terminal.'
          : 'We\'ll email you a sign-in link. .edu emails get priority + 75% off after verification.'}
      </div>

      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
          {'>'} {errorMsg}
        </div>
      )}
    </form>
  )
}

