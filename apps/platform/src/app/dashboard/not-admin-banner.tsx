'use client'

import { useState } from 'react'

export function NotAdminBanner({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  if (!show || dismissed) return null
  return (
    <div className="border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 mb-4 flex items-center justify-between gap-3 text-sm">
      <div>
        <span className="font-semibold tracking-wider text-xs mr-2">
          ADMIN-ONLY PAGE
        </span>
        You&apos;re signed in but not on the admin allowlist.
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-xs px-2 py-0.5 tracking-wider border border-amber-400 hover:bg-amber-100"
      >
        DISMISS
      </button>
    </div>
  )
}
