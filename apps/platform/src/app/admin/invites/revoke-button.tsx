'use client'

import { useTransition } from 'react'
import { revokeInviteAction } from './actions'

export function RevokeButton({ email, disabled }: { email: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition()
  return (
    <form
      action={(fd) => {
        if (!confirm(`Revoke invite for ${email}? This only affects unburned codes.`)) return
        startTransition(async () => {
          await revokeInviteAction(fd)
        })
      }}
    >
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="text-xs text-red-700 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? 'revoking…' : 'revoke'}
      </button>
    </form>
  )
}
