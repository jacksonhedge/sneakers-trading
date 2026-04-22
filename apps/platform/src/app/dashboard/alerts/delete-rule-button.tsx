'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteRuleButton({ ruleId, ruleName }: { ruleId: string; ruleName: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, startTransition] = useTransition()

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const res = await fetch(`/api/alerts/rules/${ruleId}`, { method: 'DELETE' })
              if (res.ok) router.refresh()
              else setConfirming(false)
            })
          }
          className="text-[11px] tracking-wider font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
          title={`Delete rule "${ruleName}"`}
        >
          {busy ? '…' : 'CONFIRM'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-[11px] tracking-wider text-stone-500 hover:text-stone-800"
        >
          CANCEL
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-[11px] tracking-wider text-stone-500 hover:text-red-700"
    >
      DELETE
    </button>
  )
}
