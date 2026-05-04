'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// Paste-emails bulk approver. Admin pastes one email per line, hits
// Approve. Fires N parallel calls to /api/admin/approve-user (which
// already sends an email on each successful approve) and surfaces
// per-email pass/fail. Designed for the 100-testers push — turns a
// 20-min clicking session into a 30s paste.
//
// Why emails (not IDs)? Admin's source is usually a spreadsheet/CSV
// of signups by email. Looking up IDs would add a second step.

type Result = {
  email: string
  status: 'ok' | 'not_found' | 'already_approved' | 'failed'
  error?: string
}

export function BulkApprover() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()
  const [results, setResults] = useState<Result[] | null>(null)

  function parseEmails(): string[] {
    return Array.from(
      new Set(
        text
          .split(/[\s,;]+/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.includes('@')),
      ),
    )
  }

  function go() {
    const emails = parseEmails()
    if (emails.length === 0) {
      setResults([])
      return
    }
    setResults(null)
    startTransition(async () => {
      const res = await fetch('/api/admin/approve-users-bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emails }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        results?: Result[]
      }
      setResults(data.results ?? [])
      router.refresh()
    })
  }

  const emails = parseEmails()
  const counts = results
    ? {
        ok: results.filter((r) => r.status === 'ok').length,
        not_found: results.filter((r) => r.status === 'not_found').length,
        already_approved: results.filter((r) => r.status === 'already_approved').length,
        failed: results.filter((r) => r.status === 'failed').length,
      }
    : null

  return (
    <details className="rounded-lg ring-1 ring-stone-200 bg-stone-50 mb-4">
      <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold tracking-wider text-stone-700 hover:bg-stone-100 select-none">
        BULK APPROVE — paste emails
      </summary>
      <div className="px-4 py-3 border-t border-stone-200 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="one email per line — or comma/space separated"
          rows={5}
          className="w-full text-xs font-mono px-2 py-1.5 ring-1 ring-stone-200 rounded focus:outline-none focus:ring-emerald-400"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={go}
            disabled={pending || emails.length === 0}
            className="text-[11px] tracking-wider font-semibold bg-[#00703c] text-white hover:bg-[#004225] px-3 py-1 rounded disabled:opacity-50"
          >
            {pending ? `APPROVING ${emails.length}…` : `APPROVE ${emails.length}`}
          </button>
          <span className="text-[11px] text-stone-500">
            {emails.length === 0
              ? 'paste emails above'
              : `${emails.length} unique ${emails.length === 1 ? 'email' : 'emails'}`}
          </span>
        </div>

        {counts && (
          <div className="text-[11px] flex items-center gap-3 pt-2 border-t border-stone-200">
            <span className="text-emerald-700 font-semibold">✓ {counts.ok} approved</span>
            {counts.already_approved > 0 && (
              <span className="text-stone-500">{counts.already_approved} already in</span>
            )}
            {counts.not_found > 0 && (
              <span className="text-amber-700">{counts.not_found} not found</span>
            )}
            {counts.failed > 0 && (
              <span className="text-red-700 font-semibold">✗ {counts.failed} failed</span>
            )}
          </div>
        )}

        {results && counts && counts.failed + counts.not_found > 0 && (
          <div className="text-[10px] font-mono space-y-0.5 pt-1">
            {results
              .filter((r) => r.status === 'failed' || r.status === 'not_found')
              .map((r) => (
                <div key={r.email} className="text-stone-600">
                  <span
                    className={
                      r.status === 'failed' ? 'text-red-700' : 'text-amber-700'
                    }
                  >
                    {r.status}
                  </span>{' '}
                  {r.email}
                  {r.error ? ` — ${r.error}` : ''}
                </div>
              ))}
          </div>
        )}
      </div>
    </details>
  )
}
