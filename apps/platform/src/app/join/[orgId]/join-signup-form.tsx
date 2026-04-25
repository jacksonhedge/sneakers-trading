'use client'

import { useState } from 'react'

// Member-side signup form. Same flow as /signup but carries an orgId so
// the backend can attribute this user to the org's roster on success.

function isEduEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.includes('@')) return false
  return /@([a-z0-9-]+\.)*edu(\.[a-z]{2,3})?$/.test(trimmed)
}

export function JoinSignupForm({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg(null)

    const res = await fetch('/api/auth/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        joinOrgId: orgId,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      redirect?: string
    }

    if (res.ok && json.ok && json.redirect) {
      window.location.href = json.redirect
      return
    }

    setStatus('error')
    if (json.error === 'invalid_email') setErrorMsg('Check the email address.')
    else setErrorMsg('Something went wrong. Try again in a moment.')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-[11px] tracking-wider text-emerald-300/80 mb-1">
          YOUR EMAIL <span className="text-white/40 normal-case">(.edu preferred)</span>
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
            ✓ .edu detected — student verification unlocks 75% off
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 transition disabled:opacity-50 tracking-wider"
      >
        {status === 'loading' ? 'JOINING…' : `JOIN ${orgName.toUpperCase()} →`}
      </button>

      <div className="text-[11px] text-white/55 text-center leading-relaxed">
        We&apos;ll create your account + add you to {orgName}&apos;s roster.
        No password — sign back in via magic link.
      </div>

      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
          {'>'} {errorMsg}
        </div>
      )}
    </form>
  )
}
