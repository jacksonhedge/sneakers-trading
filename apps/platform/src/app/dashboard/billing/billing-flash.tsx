'use client'

import { useEffect, useState } from 'react'

// Auto-dismissing success / canceled banner. Lives client-side so we can
// strip the query params after read without forcing a full page reload.

interface Props {
  success: boolean
  canceled: boolean
}

export function BillingFlash({ success, canceled }: Props) {
  const [show, setShow] = useState(success || canceled)

  useEffect(() => {
    if (!show) return
    // Strip the query params from the URL bar without reloading.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.delete('success')
      url.searchParams.delete('canceled')
      url.searchParams.delete('session_id')
      window.history.replaceState({}, '', url.toString())
    }
    const t = setTimeout(() => setShow(false), 8000)
    return () => clearTimeout(t)
  }, [show])

  if (!show) return null
  if (success) {
    return (
      <div className="mb-6 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm">
        ✓ Subscription started. It may take a few seconds for your tier to update — refresh if it
        still says Free.
      </div>
    )
  }
  return (
    <div className="mb-6 rounded border border-stone-300 bg-stone-100 text-stone-700 px-4 py-3 text-sm">
      Checkout canceled. No charge was made.
    </div>
  )
}
