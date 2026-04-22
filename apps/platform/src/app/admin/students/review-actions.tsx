'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// Approve / Reject buttons + reason dropdown for a single pending row.
// On success, refreshes the server component so the row drops out of the
// pending tab.

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'not_a_student', label: 'Not a student' },
  { value: 'fake_profile', label: 'Fake or unverified profile' },
  { value: 'already_graduated', label: 'Already graduated' },
  { value: 'duplicate_submission', label: 'Duplicate submission' },
  { value: 'other', label: 'Other' },
]

export function StudentReviewActions({ id }: { id: string }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState<string>('not_a_student')
  const [error, setError] = useState<string | null>(null)

  function call(action: 'approve' | 'reject', reasonValue?: string) {
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/admin/student/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action, reason: reasonValue }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        setError(body.error ?? `Failed (${res.status})`)
        return
      }
      router.refresh()
    })
  }

  if (showReject) {
    return (
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="text-xs border border-stone-300 rounded px-2 py-1.5"
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy}
          onClick={() => call('reject', reason)}
          className="px-3 py-1.5 text-xs tracking-wider font-semibold rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          CONFIRM REJECT
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowReject(false)}
          className="px-3 py-1.5 text-xs tracking-wider font-semibold rounded text-stone-600 hover:text-stone-900"
        >
          CANCEL
        </button>
        {error && <div className="text-xs text-red-700 ml-2">{error}</div>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <button
        type="button"
        disabled={busy}
        onClick={() => setShowReject(true)}
        className="px-3 py-1.5 text-xs tracking-wider font-semibold rounded border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
      >
        REJECT
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => call('approve')}
        className="px-3 py-1.5 text-xs tracking-wider font-semibold rounded bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy ? '…' : 'APPROVE'}
      </button>
      {error && <div className="text-xs text-red-700 ml-2">{error}</div>}
    </div>
  )
}
