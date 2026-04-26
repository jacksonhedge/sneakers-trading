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
        className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 transition disabled:opacity-50"
      >
        {pending ? 'SENDING…' : label}
      </button>
      {result && (
        <div
          className={`text-xs px-3 py-2 ${
            result.ok
              ? 'border border-emerald-400/60 bg-emerald-400/10 text-emerald-300'
              : 'border border-red-400/60 bg-red-400/10 text-red-300'
          }`}
        >
          {result.message}
        </div>
      )}
      {devLink && (
        <div className="text-[11px] px-3 py-2 border border-amber-400/60 bg-amber-400/10 text-amber-200">
          <div className="font-semibold mb-1">⚠ DEV MODE LINK:</div>
          <a href={devLink} className="text-amber-100 hover:text-amber-50 underline break-all">
            {devLink}
          </a>
        </div>
      )}
    </div>
  )
}
