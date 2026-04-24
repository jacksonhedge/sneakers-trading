'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type ErrorCode =
  | 'invalid_handle'
  | 'invalid_college'
  | 'handle_taken'
  | 'not_verified_student'
  | 'verification_expired'
  | 'unauthorized'
  | 'server_error'

const ERROR_COPY: Record<ErrorCode, string> = {
  invalid_handle: 'Handle must be 3-20 characters — letters, numbers, or underscores.',
  invalid_college: 'College name looks wrong — enter the full name (e.g. "University of Florida").',
  handle_taken: "That handle's already in use. Pick another.",
  not_verified_student:
    'Your student verification needs to be approved before you can join. Submit at /students.',
  verification_expired: 'Your student verification expired — resubmit to rejoin.',
  unauthorized: 'Sign in first.',
  server_error: 'Something broke. Try again in a second.',
}

export function JoinForm() {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [college, setCollege] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/leaderboard/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: handle.trim(), college: college.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: ErrorCode; ok?: boolean }
      if (!res.ok || !json.ok) {
        const code = (json.error ?? 'server_error') as ErrorCode
        setError(ERROR_COPY[code] ?? ERROR_COPY.server_error)
        setSubmitting(false)
        return
      }
      router.push('/dashboard/leaderboard')
    } catch {
      setError(ERROR_COPY.server_error)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="handle" className="block text-xs font-semibold text-stone-700 mb-1.5">
          Display handle
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-mono text-sm">
            @
          </span>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="TheGOAT"
            maxLength={20}
            required
            autoComplete="off"
            className="w-full pl-8 pr-3 py-2.5 text-sm border border-stone-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-500"
          />
        </div>
        <div className="mt-1 text-[11px] text-stone-500">
          3-20 characters. Letters, numbers, underscore. Shown on public leaderboards.
        </div>
      </div>

      <div>
        <label htmlFor="college" className="block text-xs font-semibold text-stone-700 mb-1.5">
          College / university
        </label>
        <input
          id="college"
          type="text"
          value={college}
          onChange={(e) => setCollege(e.target.value)}
          placeholder="University of Florida"
          maxLength={80}
          required
          autoComplete="organization"
          className="w-full px-3 py-2.5 text-sm border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-500"
        />
        <div className="mt-1 text-[11px] text-stone-500">
          Full name — the per-school leaderboard groups on exact match.
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !handle || !college}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-sm font-semibold tracking-wider px-6 py-3 rounded transition"
      >
        {submitting ? 'JOINING…' : 'JOIN LEADERBOARD →'}
      </button>
    </form>
  )
}
