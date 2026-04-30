'use client'

import { useState, useTransition } from 'react'
import { cleanupStressEmailsAction } from './actions'

// Stress-test cleanup deletes waitlist rows by email pattern. The action is
// destructive and operates on real production data, so we gate it behind a
// type-to-confirm step — same pattern the planned autotrade kill-switch
// uses. A bare confirm() dialog is too easy to dismiss reflexively.

const CONFIRM_TOKEN = 'DELETE'

export function StressCleanupButton() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [armed, setArmed] = useState(false)
  const [token, setToken] = useState('')

  function reset() {
    setArmed(false)
    setToken('')
  }

  if (!armed) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setResult(null)
            setArmed(true)
          }}
          className="bg-red-700 text-white text-xs px-4 py-2 tracking-wider hover:bg-red-800 disabled:opacity-50"
        >
          DELETE STRESS-TEST ROWS
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

  return (
    <div className="space-y-2 border border-red-300 bg-red-50 p-3 max-w-md">
      <div className="text-xs text-red-800">
        This deletes every waitlist row whose email matches{' '}
        <code className="bg-white px-1">stress+%</code> or{' '}
        <code className="bg-white px-1">stress-%</code>. Destructive and
        immediate — no recovery. Type{' '}
        <code className="bg-white px-1 font-bold">{CONFIRM_TOKEN}</code> to
        enable the button.
      </div>
      <input
        type="text"
        autoFocus
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={`type ${CONFIRM_TOKEN}`}
        className="border border-red-300 bg-white px-2 py-1 text-xs font-mono w-full"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || token !== CONFIRM_TOKEN}
          onClick={() => {
            startTransition(async () => {
              const r = await cleanupStressEmailsAction()
              setResult(r)
              reset()
            })
          }}
          className="bg-red-700 text-white text-xs px-3 py-1.5 tracking-wider hover:bg-red-800 disabled:opacity-30"
        >
          {pending ? 'DELETING…' : `CONFIRM DELETE`}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={reset}
          className="bg-white border border-stone-300 text-stone-700 text-xs px-3 py-1.5 tracking-wider hover:bg-stone-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
