'use client'

import { useState } from 'react'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!normalized.includes('@')) {
      setError('Enter a valid email.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: normalized }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      devLink?: string
    }
    setBusy(false)
    if (!res.ok || !data.ok) {
      setError('Something went wrong. Try again in a moment.')
      return
    }
    if (data.devLink) setDevLink(data.devLink)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 px-3 py-3 text-xs font-semibold">
          ✓ If an account exists for that email, we just sent a reset link.
          Check your inbox.
        </div>
        {devLink && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-[11px]">
            <div className="font-semibold mb-1">⚠ DEV MODE LINK:</div>
            <a
              href={devLink}
              className="text-amber-900 hover:text-amber-950 underline break-all"
            >
              {devLink}
            </a>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@firm.com"
        autoComplete="email"
        className="w-full bg-stone-50 border border-stone-300 text-stone-900 px-4 py-3 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition"
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-emerald-500 text-black font-semibold px-6 py-3 ring-1 ring-emerald-400 hover:bg-emerald-400 transition disabled:opacity-50"
      >
        {busy ? 'SENDING…' : 'SEND RESET LINK →'}
      </button>
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-xs font-semibold">
          {error}
        </div>
      )}
    </form>
  )
}
