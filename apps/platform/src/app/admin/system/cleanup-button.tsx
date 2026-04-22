'use client'

import { useState, useTransition } from 'react'
import { cleanupStressEmailsAction } from './actions'

export function StressCleanupButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              'Delete all waitlist rows where email matches stress+% or stress-% ?\nThis is DESTRUCTIVE and immediate.',
            )
          ) {
            return
          }
          setResult(null)
          startTransition(async () => {
            const r = await cleanupStressEmailsAction()
            setResult(r)
          })
        }}
        className="bg-red-700 text-white text-xs px-4 py-2 tracking-wider hover:bg-red-800 disabled:opacity-50"
      >
        {pending ? 'DELETING…' : 'DELETE STRESS-TEST ROWS'}
      </button>
      {result && (
        <div
          className={`text-xs px-3 py-2 inline-block ${
            result.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  )
}
