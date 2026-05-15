'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// Two-step close: first click arms (CLOSE → CONFIRM CLOSE), second
// click fires. Cancel button reverts. Avoids accidental fat-finger
// closes since the action is irreversible (we sell at venue).

export function CloseButton({ positionId }: { positionId: string }) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function fire() {
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/autotrade/positions/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ positionId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!data.ok) {
        setError(data.error ?? 'close failed')
        setArmed(false)
        return
      }
      // Refresh the server component so the closed position drops off
      // the list (it'll move to status=closed and disappear from
      // listOpenPositionsForUser).
      router.refresh()
    })
  }

  if (error) {
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setArmed(false)
          }}
          className="w-full text-[10px] tracking-wider text-stone-500 hover:text-stone-900"
        >
          dismiss
        </button>
      </div>
    )
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="w-full text-[10px] font-bold tracking-wider px-3 py-1.5 rounded-full border border-stone-300 text-stone-700 hover:border-stone-500 hover:bg-stone-50 transition"
      >
        CLOSE NOW
      </button>
    )
  }

  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={fire}
        disabled={pending}
        className="flex-1 text-[10px] font-bold tracking-wider px-3 py-1.5 rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition"
      >
        {pending ? 'SELLING…' : 'CONFIRM SELL AT MID'}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        disabled={pending}
        className="text-[10px] font-bold tracking-wider px-3 py-1.5 rounded-full text-stone-500 hover:text-stone-900 transition"
      >
        cancel
      </button>
    </div>
  )
}
