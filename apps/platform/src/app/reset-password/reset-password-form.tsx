'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const PASSWORD_MIN = 8

type Phase = 'idle' | 'saving' | 'saved' | 'error'

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  // Live validation surfacing for the user — no surprises at click time.
  const matches = password.length === 0 || confirm.length === 0 || password === confirm
  const longEnough = password.length >= PASSWORD_MIN
  const valid = longEnough && password === confirm

  // After a successful save we show a green "saved" card for ~1.4s
  // before sending them to /dashboard, so they actually see confirmation
  // instead of a flash-then-redirect.
  useEffect(() => {
    if (phase !== 'saved') return
    const id = setTimeout(() => {
      router.push('/dashboard')
      router.refresh()
    }, 1400)
    return () => clearTimeout(id)
  }, [phase, router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Those passwords don't match.")
      setPhase('error')
      return
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`)
      setPhase('error')
      return
    }
    setPhase('saving')
    setError(null)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      message?: string
    }
    if (!res.ok || !data.ok) {
      setError(data.message ?? 'Something went wrong. Try again in a moment.')
      setPhase('error')
      return
    }
    setPhase('saved')
  }

  // Saved state — full confirmation card replaces the form. Routes to
  // /dashboard automatically after 1.4s; user can also click through.
  if (phase === 'saved') {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-400 bg-emerald-50 px-4 py-4 text-emerald-800">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <span aria-hidden>✓</span>
            <span>Password saved.</span>
          </div>
          <div className="text-xs leading-relaxed">
            You can use this password to sign in from now on. Sending you to your
            dashboard now…
          </div>
        </div>
        <a
          href="/dashboard"
          className="block w-full text-center rounded-full bg-emerald-500 text-black font-semibold px-6 py-3 ring-1 ring-emerald-400 hover:bg-emerald-400 transition"
        >
          GO TO DASHBOARD →
        </a>
      </div>
    )
  }

  const busy = phase === 'saving'

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="relative">
        <input
          type={showPw ? 'text' : 'password'}
          required
          disabled={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="new password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          className="w-full bg-stone-50 border border-stone-300 text-stone-900 px-4 py-3 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => setShowPw((s) => !s)}
          disabled={busy}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tracking-wider text-emerald-700 hover:text-emerald-800 font-semibold disabled:opacity-50"
        >
          {showPw ? 'HIDE' : 'SHOW'}
        </button>
      </div>
      <input
        type={showPw ? 'text' : 'password'}
        required
        disabled={busy}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="confirm new password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        className={`w-full bg-stone-50 text-stone-900 px-4 py-3 rounded-lg focus:outline-none focus:ring-1 placeholder:text-stone-400 transition disabled:opacity-60 ${
          confirm.length > 0 && !matches
            ? 'border border-red-400 focus:border-red-500 focus:ring-red-400/40'
            : 'border border-stone-300 focus:border-emerald-500 focus:ring-emerald-400/40'
        }`}
      />

      {/* Live requirement checklist — gives the user something to react to
          while they type, before they hit submit and get a delayed error. */}
      <ul className="text-[11px] text-stone-600 space-y-0.5 px-1">
        <li className={longEnough ? 'text-emerald-700' : 'text-stone-500'}>
          {longEnough ? '✓' : '○'} At least {PASSWORD_MIN} characters
        </li>
        <li
          className={
            confirm.length === 0
              ? 'text-stone-500'
              : matches
                ? 'text-emerald-700'
                : 'text-red-700'
          }
        >
          {confirm.length === 0 ? '○' : matches ? '✓' : '✗'} Both fields match
        </li>
      </ul>

      <button
        type="submit"
        disabled={busy || !valid}
        className="w-full rounded-full bg-emerald-500 text-black font-semibold px-6 py-3 ring-1 ring-emerald-400 hover:bg-emerald-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && (
          <span
            className="inline-block w-3 h-3 rounded-full border-2 border-black/30 border-t-black animate-spin"
            aria-hidden
          />
        )}
        {busy ? 'SAVING…' : 'SAVE NEW PASSWORD →'}
      </button>
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-xs font-semibold">
          {error}
        </div>
      )}
    </form>
  )
}
