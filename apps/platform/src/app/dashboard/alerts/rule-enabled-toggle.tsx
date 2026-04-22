'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function RuleEnabledToggle({ ruleId, enabled }: { ruleId: string; enabled: boolean }) {
  const router = useRouter()
  const [optimistic, setOptimistic] = useState(enabled)
  const [busy, startTransition] = useTransition()

  function toggle() {
    const next = !optimistic
    setOptimistic(next)
    startTransition(async () => {
      const res = await fetch(`/api/alerts/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) {
        setOptimistic(!next) // revert
      } else {
        router.refresh()
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      role="switch"
      aria-checked={optimistic}
      className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        optimistic ? 'bg-emerald-600' : 'bg-stone-300'
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          optimistic ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
