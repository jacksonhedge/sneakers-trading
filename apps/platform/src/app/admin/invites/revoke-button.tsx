'use client'

import { useState, useTransition } from 'react'
import { revokeInviteAction } from './actions'

// Two-step inline confirm. First click arms the button (label + cancel
// appear); second click submits the revoke. More visible than a native
// confirm() and avoids the click-through-by-reflex failure mode the
// admin inventory walk flagged.

export function RevokeButton({ email, disabled }: { email: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => setArmed(true)}
        className="text-xs text-red-700 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
      >
        revoke
      </button>
    )
  }

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await revokeInviteAction(fd)
          setArmed(false)
        })
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-white bg-red-700 px-2 py-0.5 rounded hover:bg-red-800 disabled:opacity-50"
      >
        {pending ? 'revoking…' : `confirm revoke`}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setArmed(false)}
        className="text-xs text-stone-500 hover:underline"
      >
        cancel
      </button>
    </form>
  )
}
