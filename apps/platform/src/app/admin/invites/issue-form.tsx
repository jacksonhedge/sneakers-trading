'use client'

import { useState, useTransition } from 'react'
import { issueInviteAction } from './actions'

export function IssueForm() {
  const [email, setEmail] = useState('')
  const [force, setForce] = useState(false)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  return (
    <form
      action={(fd) => {
        setResult(null)
        startTransition(async () => {
          const r = await issueInviteAction(fd)
          setResult(r)
          if (r.ok) setEmail('')
        })
      }}
      className="border border-stone-300 bg-white p-4 space-y-3"
    >
      <div className="text-xs text-[#004225] tracking-wider">{'>'} ISSUE INVITE</div>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="email"
          name="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tester@example.com"
          className="border border-stone-300 px-3 py-2 text-sm flex-1 min-w-64"
        />
        <label className="flex items-center gap-1 text-xs text-stone-700">
          <input
            type="checkbox"
            name="force"
            value="1"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />
          force re-issue
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-[#00703c] text-white text-xs px-4 py-2 tracking-wider disabled:opacity-50"
        >
          {pending ? 'ISSUING…' : 'ISSUE CODE'}
        </button>
      </div>
      {result && (
        <div
          className={`text-xs px-3 py-2 ${
            result.ok
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {result.message}
        </div>
      )}
      <div className="text-[11px] text-stone-500">
        The user must already be on the waitlist. Email is sent via Resend on success.
      </div>
    </form>
  )
}
