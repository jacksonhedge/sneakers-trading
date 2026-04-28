'use client'

import { useState, useTransition } from 'react'

export function MagicLinkButton({ email, label }: { email: string; label: string }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [devLink, setDevLink] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setResult(null)
          setDevLink(null)
          startTransition(async () => {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email }),
            })
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean
              status?: string
              devLink?: string
            }
            if (res.ok && data.ok) {
              if (data.devLink) setDevLink(data.devLink)
              setResult({
                ok: true,
                message: 'Magic link sent. Check your inbox.',
              })
            } else {
              setResult({
                ok: false,
                message: `Couldn't send magic link (${data.status ?? res.status}). Try again in a moment.`,
              })
            }
          })
        }}
        className="w-full rounded-full bg-emerald-500 text-black font-semibold px-6 py-3 ring-1 ring-emerald-400 hover:bg-emerald-400 transition disabled:opacity-50"
      >
        {pending ? 'SENDING…' : label}
      </button>
      {result && (
        <div
          className={`text-xs px-3 py-2 rounded-lg ${
            result.ok
              ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold'
              : 'border border-red-300 bg-red-50 text-red-700 font-semibold'
          }`}
        >
          {result.message}
        </div>
      )}
      {devLink && (
        <div className="text-[11px] px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800">
          <div className="font-semibold mb-1">⚠ DEV MODE LINK:</div>
          <a href={devLink} className="text-amber-900 hover:text-amber-950 underline break-all">
            {devLink}
          </a>
        </div>
      )}
    </div>
  )
}
