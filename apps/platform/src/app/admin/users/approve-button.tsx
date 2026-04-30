'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// Approve / revoke control for the admin users table. Shows different
// labels + colors based on whether the row is currently approved
// (invite_used_at not null) or pending.
//
// On click → POST /api/admin/approve-user → router.refresh() so the
// row's status pill flips immediately. Disables itself during the
// in-flight request to prevent double-clicks.

export function ApproveButton({
  userId,
  approved,
}: {
  userId: string
  approved: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go(action: 'approve' | 'revoke') {
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/admin/approve-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: userId, action }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      router.refresh()
    })
  }

  if (error) {
    return (
      <span
        className="text-[10px] text-red-700 font-semibold"
        title={error}
      >
        FAILED
      </span>
    )
  }

  if (approved) {
    return (
      <button
        type="button"
        onClick={() => go('revoke')}
        disabled={pending}
        className="text-[10px] tracking-wider font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
        title="Revoke approval — bumps user back to /pending"
      >
        {pending ? '…' : 'REVOKE'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => go('approve')}
      disabled={pending}
      className="text-[10px] tracking-wider font-semibold bg-[#00703c] text-white hover:bg-[#004225] px-2 py-0.5 rounded disabled:opacity-50"
    >
      {pending ? 'APPROVING…' : 'APPROVE'}
    </button>
  )
}
