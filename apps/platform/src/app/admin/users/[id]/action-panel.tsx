'use client'

import { useState, useTransition } from 'react'
import { grantAccessAction } from './actions'
import { issueInviteAction, revokeInviteAction } from '../../invites/actions'

// State-aware action panel for the user-detail page. Shows different
// buttons depending on the row's current state:
//
//   WAITLIST (no invite_code, no invite_used_at):
//     - Issue invite        → mints a code + sends email via Resend
//     - Grant access        → mints a code AND burns it (skips waitlist + email)
//
//   INVITED (has invite_code, not used):
//     - Grant access        → burns the existing code, no new email
//     - Re-issue with force → revokes + mints a fresh code (sends email)
//     - Revoke              → nulls all 3 invite fields
//
//   AUTHED (invite_used_at set):
//     - (no actions — already in)
//
// Two-step inline confirm on every destructive / irreversible button:
// first click arms it, second click submits. Result message renders below
// and persists until the next action.

type Status = 'WAITLIST' | 'INVITED' | 'AUTHED'

export function UserActionPanel({
  email,
  status,
}: {
  email: string
  status: Status
}) {
  const [pending, startTransition] = useTransition()
  const [armed, setArmed] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function run(actionId: string, exec: () => Promise<{ ok: boolean; message: string }>) {
    if (armed !== actionId) {
      setResult(null)
      setArmed(actionId)
      return
    }
    startTransition(async () => {
      const r = await exec()
      setResult(r)
      setArmed(null)
    })
  }

  function buildFormData(extras?: Record<string, string>) {
    const fd = new FormData()
    fd.set('email', email)
    if (extras) for (const [k, v] of Object.entries(extras)) fd.set(k, v)
    return fd
  }

  // Render a result banner consistently across both branches. Without
  // this, a successful Grant access flips status → AUTHED → the panel
  // takes the early-return branch below and the result message
  // disappears with the previous render path.
  const ResultBanner = () =>
    result ? (
      <div
        className={`text-xs px-3 py-2 inline-block ${
          result.ok
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}
      >
        {result.message}
      </div>
    ) : null

  if (status === 'AUTHED') {
    return (
      <div className="space-y-3">
        <ResultBanner />
        <div className="text-xs text-stone-500">
          Already authed. No actions available — to revoke access you would
          need to delete the underlying auth.users row, which isn&apos;t
          wired up here yet.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {/* Grant access — works in both WAITLIST and INVITED */}
        <ActionButton
          armed={armed === 'grant'}
          pending={pending}
          variant="primary"
          label={status === 'WAITLIST' ? 'Grant access' : 'Burn code (grant access)'}
          confirmLabel="Confirm grant"
          onClick={() =>
            run('grant', () => grantAccessAction(buildFormData()))
          }
          onCancel={() => setArmed(null)}
        />

        {/* Issue invite — only when waitlist */}
        {status === 'WAITLIST' && (
          <ActionButton
            armed={armed === 'issue'}
            pending={pending}
            variant="secondary"
            label="Issue invite (email)"
            confirmLabel="Confirm issue"
            onClick={() =>
              run('issue', () => issueInviteAction(buildFormData()))
            }
            onCancel={() => setArmed(null)}
          />
        )}

        {/* Re-issue with force — only when invited */}
        {status === 'INVITED' && (
          <ActionButton
            armed={armed === 'reissue'}
            pending={pending}
            variant="secondary"
            label="Re-issue (force, sends new email)"
            confirmLabel="Confirm re-issue"
            onClick={() =>
              run('reissue', () =>
                issueInviteAction(buildFormData({ force: '1' })),
              )
            }
            onCancel={() => setArmed(null)}
          />
        )}

        {/* Revoke — only when invited */}
        {status === 'INVITED' && (
          <ActionButton
            armed={armed === 'revoke'}
            pending={pending}
            variant="destructive"
            label="Revoke invite"
            confirmLabel="Confirm revoke"
            onClick={() =>
              run('revoke', () => revokeInviteAction(buildFormData()))
            }
            onCancel={() => setArmed(null)}
          />
        )}
      </div>

      <ResultBanner />
    </div>
  )
}

function ActionButton({
  armed,
  pending,
  variant,
  label,
  confirmLabel,
  onClick,
  onCancel,
}: {
  armed: boolean
  pending: boolean
  variant: 'primary' | 'secondary' | 'destructive'
  label: string
  confirmLabel: string
  onClick: () => void
  onCancel: () => void
}) {
  if (!armed) {
    const cls =
      variant === 'primary'
        ? 'bg-[#00703c] text-white hover:bg-[#005a30]'
        : variant === 'destructive'
          ? 'bg-white text-red-700 border border-red-300 hover:bg-red-50'
          : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50'
    return (
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className={`text-xs px-3 py-1.5 tracking-wider transition disabled:opacity-50 ${cls}`}
      >
        {label.toUpperCase()}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className={`px-3 py-1.5 tracking-wider transition disabled:opacity-50 ${
          variant === 'destructive'
            ? 'bg-red-700 text-white hover:bg-red-800'
            : 'bg-[#004225] text-white hover:bg-[#002914]'
        }`}
      >
        {pending ? 'WORKING…' : confirmLabel.toUpperCase()}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        className="text-stone-500 hover:underline"
      >
        cancel
      </button>
    </span>
  )
}
