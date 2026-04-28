'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PASSWORD_MIN = 8

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid =
    password.length >= PASSWORD_MIN && confirm.length >= PASSWORD_MIN

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Those passwords don't match.")
      return
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`)
      return
    }
    setBusy(true)
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
    setBusy(false)
    if (!res.ok || !data.ok) {
      setError(data.message ?? 'Something went wrong. Try again in a moment.')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="relative">
        <input
          type={showPw ? 'text' : 'password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="new password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          className="w-full bg-stone-50 border border-stone-300 text-stone-900 px-4 py-3 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition"
        />
        <button
          type="button"
          onClick={() => setShowPw((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tracking-wider text-emerald-700 hover:text-emerald-800 font-semibold"
        >
          {showPw ? 'HIDE' : 'SHOW'}
        </button>
      </div>
      <input
        type={showPw ? 'text' : 'password'}
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="confirm new password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        className="w-full bg-stone-50 border border-stone-300 text-stone-900 px-4 py-3 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-400/40 placeholder:text-stone-400 transition"
      />
      <button
        type="submit"
        disabled={busy || !valid}
        className="w-full rounded-full bg-emerald-500 text-black font-semibold px-6 py-3 ring-1 ring-emerald-400 hover:bg-emerald-400 transition disabled:opacity-50"
      >
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
