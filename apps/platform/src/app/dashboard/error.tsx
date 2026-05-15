'use client'

import { useEffect } from 'react'
import Link from 'next/link'

// Dashboard-segment error boundary. Without this file, any error thrown
// during render under /dashboard bubbles to the root error boundary and
// unmounts the entire layout for the user. This catches errors locally,
// keeps the chrome around it stable, and gives the user a path forward.

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard/error]', error)
  }, [error])

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900 flex items-center justify-center p-8">
      <div className="max-w-md w-full rounded-2xl bg-white ring-1 ring-stone-200 shadow-[0_12px_32px_rgba(0,0,0,0.06)] p-6 space-y-4">
        <div className="text-xs text-emerald-700 tracking-wider font-semibold">
          SNEAKERS TERMINAL · DASHBOARD
        </div>
        <h1 className="text-lg font-semibold">Something hiccuped here.</h1>
        <p className="text-sm text-stone-600 leading-relaxed">
          The dashboard hit an unexpected error. Try again — most issues clear
          on a refresh. If it keeps happening, ping us and include the code
          below.
        </p>
        {error.digest && (
          <div className="text-[10px] tracking-wider text-stone-500 font-mono">
            REF · {error.digest}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-full bg-emerald-500 text-black font-semibold px-4 py-2 ring-1 ring-emerald-400 hover:bg-emerald-400 transition text-sm"
          >
            Try again
          </button>
          <Link
            href="/"
            className="flex-1 text-center rounded-full bg-white text-stone-800 font-semibold px-4 py-2 ring-1 ring-stone-300 hover:bg-stone-50 transition text-sm"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
