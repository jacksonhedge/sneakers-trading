'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

// Reads ?error=not_admin off the URL itself rather than taking a prop.
// Lives in DashboardShell (client component) so it renders the moment
// the layout mounts — independent of whatever server-component fetches
// the page underneath is doing. The whole point is to surface the
// "you're not on the allowlist" message even while the rest of the
// dashboard is still loading.

export function NotAdminBanner() {
  const sp = useSearchParams()
  const show = sp?.get('error') === 'not_admin'
  const [dismissed, setDismissed] = useState(false)
  if (!show || dismissed) return null
  return (
    <div className="border-b border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 flex items-center justify-between gap-3 text-sm">
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
