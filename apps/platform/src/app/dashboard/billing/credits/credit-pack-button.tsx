'use client'

import { useState } from 'react'

export function CreditPackButton({ packId, label }: { packId: string; label: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string }
      if (!res.ok || !data.url) {
        setError(data.message ?? data.error ?? `HTTP ${res.status}`)
        setPending(false)
        return
      }
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      setPending(false)
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={onClick}
        disabled={pending}
        className="w-full rounded bg-[#004225] hover:bg-[#00703c] text-white text-sm font-semibold py-2 px-4 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? 'Redirecting…' : label}
      </button>
      {error && (
        <div className="mt-2 text-xs text-red-600">
          {error}
        </div>
      )}
    </div>
  )
}
