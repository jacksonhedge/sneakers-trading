'use client'

import { useState } from 'react'

// Client-side opt-in button for the autotrade waitlist. Writes to user_profiles
// via POST /api/me/autotrade-waitlist. No config collected up-front — we just
// capture the opt-in + timestamp, then email when we're ready to onboard.

export function AutotradeWaitlistForm() {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function submit() {
    setStatus('submitting')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/me/autotrade-waitlist', { method: 'POST' })
      if (!res.ok) {
        setStatus('error')
        setErrorMsg('Could not save — try again in a moment.')
        return
      }
      setStatus('done')
    } catch {
      setStatus('error')
      setErrorMsg('Network hiccup — try again.')
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        ✓ You&apos;re on the list. We&apos;ll email when the first Polymarket-integrated
        rules go live.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={submit}
        disabled={status === 'submitting'}
        className="inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-sm font-semibold tracking-wider px-6 py-3 transition"
      >
        {status === 'submitting' ? 'Adding…' : 'Add me to the autotrade waitlist →'}
      </button>
      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-700">{errorMsg}</div>
      )}
    </div>
  )
}
