'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { parseEmailList, isValidEmail } from './email-parser'

interface Invitation {
  id: string
  invited_email: string
  status: string
  invited_at: string
  sent_at: string | null
  accepted_at: string | null
}

interface Props {
  orgId: string
  initialInvitations: Invitation[]
}

const SITE_URL =
  typeof window === 'undefined'
    ? 'https://sneakersterminal.com'
    : window.location.origin

// Members tab: paste-list + CSV/.vcf upload + pending-list pills + roster
// table. Submits to POST /api/org/invite. CSV/vCard parsing is the same
// regex-based parser as paste-list — works on any text input.

export function MembersTab({ orgId, initialInvitations }: Props) {
  const router = useRouter()
  const [pasteText, setPasteText] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const joinLink = `${SITE_URL}/join/${orgId}`

  function copyJoinLink() {
    navigator.clipboard?.writeText(joinLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    })
  }
  const [pillEmails, setPillEmails] = useState<string[]>([])
  const [parseSummary, setParseSummary] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<string | null>(null)
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function applyParse(input: string) {
    const result = parseEmailList(input)
    if (result.emails.length === 0) {
      setParseSummary('No email addresses found.')
      return
    }
    // Merge into existing pills (dedupe).
    const merged = Array.from(new Set([...pillEmails, ...result.emails])).sort()
    setPillEmails(merged)
    const newCount = merged.length - pillEmails.length
    const dupeNote = result.duplicateCount > 0 ? ` · ${result.duplicateCount} duplicate(s) deduped` : ''
    setParseSummary(`${newCount} new, ${pillEmails.length} already pending${dupeNote}.`)
  }

  function onPasteSubmit() {
    if (!pasteText.trim()) return
    applyParse(pasteText)
    setPasteText('')
  }

  function onFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '')
      applyParse(text)
    }
    reader.readAsText(file)
  }

  function removePill(email: string) {
    setPillEmails((prev) => prev.filter((p) => p !== email))
  }

  async function submitInvites() {
    if (pillEmails.length === 0) return
    setSubmitting(true)
    setSubmitMsg(null)
    setSubmitErr(null)
    try {
      const res = await fetch('/api/org/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: pillEmails }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        detail?: string
        queued?: number
      }
      if (!res.ok || !json.ok) {
        setSubmitErr(json.detail ?? json.error ?? 'Could not save — try again.')
        setSubmitting(false)
        return
      }
      setSubmitMsg(`Queued ${json.queued ?? pillEmails.length} invitations.`)
      setPillEmails([])
      setParseSummary(null)
      router.refresh()
    } catch {
      setSubmitErr('Network hiccup — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Shareable join link — fastest member onboarding path. Captain
          copies this, texts to brothers, each tap signs them up + adds
          them to the roster automatically. No email-send required. */}
      <section className="rounded-lg ring-1 ring-emerald-300 bg-emerald-50 p-5">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <h2 className="text-base font-semibold text-stone-900">
            Your join link
          </h2>
          <span className="text-[10px] tracking-[0.15em] font-bold text-emerald-800 bg-white ring-1 ring-emerald-300 px-2 py-1 rounded">
            FASTEST
          </span>
        </div>
        <p className="text-xs text-stone-700 leading-relaxed mb-3">
          Text this link to your roster. Each tap signs them up + adds them
          to your org automatically — no email-send needed.
        </p>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={joinLink}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-white ring-1 ring-stone-300 text-stone-800 text-xs px-3 py-2 rounded font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={copyJoinLink}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold tracking-wider px-4 py-2 rounded transition"
          >
            {linkCopied ? 'COPIED ✓' : 'COPY'}
          </button>
        </div>
      </section>

      {/* Import controls — pre-invite specific emails (alternative to
          the share-link flow above, useful for tracking who hasn't joined
          yet). */}
      <section className="rounded-lg ring-1 ring-stone-200 bg-white p-6">
        <h2 className="text-lg font-semibold mb-1">Or pre-invite by email</h2>
        <p className="text-sm text-stone-600 mb-4 leading-relaxed">
          Paste a list, drop a CSV or .vcf export. Each row goes into your roster as{' '}
          <span className="font-semibold">pending</span> — converts to{' '}
          <span className="font-semibold">accepted</span> when they sign up via the
          link above.
        </p>

        {/* Paste-list */}
        <div className="space-y-2 mb-5">
          <label
            htmlFor="paste-list"
            className="block text-xs tracking-wider font-semibold text-stone-700"
          >
            PASTE EMAILS
          </label>
          <textarea
            id="paste-list"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`j@uf.edu, m@uf.edu\nJeremy Albus <jeremy@uf.edu>\np@uf.edu`}
            rows={4}
            className="w-full rounded border border-stone-300 px-3 py-2 text-sm text-stone-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPasteSubmit}
              disabled={!pasteText.trim()}
              className="bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-xs font-semibold tracking-wider px-4 py-2 rounded transition"
            >
              ADD FROM TEXT →
            </button>
            <span className="text-[11px] text-stone-500">
              Comma, semicolon, newline, or &quot;Name &lt;email&gt;&quot; — all work.
            </span>
          </div>
        </div>

        {/* CSV / vCard upload */}
        <div className="space-y-2 mb-5">
          <label className="block text-xs tracking-wider font-semibold text-stone-700">
            UPLOAD CSV OR .VCF
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.vcf,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="text-xs text-stone-700 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-stone-900 file:text-white file:text-xs file:font-semibold file:tracking-wider file:cursor-pointer hover:file:bg-stone-800"
            />
            <span className="text-[11px] text-stone-500">
              Apple Contacts → File → Export → vCard. Google Contacts → Export → CSV.
            </span>
          </div>
        </div>

        {parseSummary && (
          <div className="text-xs text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded px-3 py-2">
            {parseSummary}
          </div>
        )}
      </section>

      {/* Pending pills + submit */}
      {pillEmails.length > 0 && (
        <section className="rounded-lg ring-1 ring-emerald-300 bg-emerald-50/50 p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-stone-900">
              Ready to invite{' '}
              <span className="font-mono tabular-nums text-emerald-700">{pillEmails.length}</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setPillEmails([])
                setParseSummary(null)
              }}
              className="text-xs text-stone-500 hover:text-stone-800 underline"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {pillEmails.map((email) => {
              const valid = isValidEmail(email)
              return (
                <span
                  key={email}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ring-1 ${
                    valid
                      ? 'bg-white ring-stone-300 text-stone-800'
                      : 'bg-red-50 ring-red-300 text-red-800'
                  }`}
                >
                  <span className="font-mono">{email}</span>
                  <button
                    type="button"
                    onClick={() => removePill(email)}
                    className="text-stone-400 hover:text-stone-700 leading-none"
                    aria-label={`Remove ${email}`}
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </div>
          <button
            type="button"
            onClick={submitInvites}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white text-sm font-semibold tracking-wider px-6 py-3 rounded transition"
          >
            {submitting ? 'SAVING…' : `INVITE ${pillEmails.length} MEMBER${pillEmails.length === 1 ? '' : 'S'} →`}
          </button>
          {submitErr && (
            <div className="mt-3 text-xs text-red-700 bg-red-50 ring-1 ring-red-200 rounded px-3 py-2">
              {submitErr}
            </div>
          )}
        </section>
      )}

      {submitMsg && (
        <div className="rounded ring-1 ring-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ {submitMsg}
        </div>
      )}

      {/* Roster */}
      <section className="rounded-lg ring-1 ring-stone-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Roster</h2>
          <div className="text-[11px] text-stone-500">
            {initialInvitations.length} total
          </div>
        </div>
        {initialInvitations.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-stone-500">
            No invitations yet. Paste your roster above to start.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] tracking-wider text-stone-500 bg-stone-50">
                <th className="text-left px-6 py-3 font-semibold">EMAIL</th>
                <th className="text-left px-6 py-3 font-semibold">STATUS</th>
                <th className="text-left px-6 py-3 font-semibold">ADDED</th>
                <th className="text-right px-6 py-3 font-semibold">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {initialInvitations.map((inv) => (
                <RosterRow key={inv.id} inv={inv} onChanged={() => router.refresh()} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="text-[11px] text-stone-500 leading-relaxed">
        Email delivery starts once your org is approved + Resend domain is verified.
        Until then, invitations sit in <code className="bg-stone-100 px-1 rounded">pending</code> status.
      </div>
    </div>
  )
}

function RosterRow({ inv, onChanged }: { inv: Invitation; onChanged: () => void }) {
  const [working, setWorking] = useState<'approve' | 'revoke' | null>(null)
  const statusMeta: Record<string, { label: string; cls: string }> = {
    pending: { label: 'PENDING', cls: 'bg-amber-100 text-amber-800 ring-amber-300' },
    sent: { label: 'SENT', cls: 'bg-blue-100 text-blue-800 ring-blue-300' },
    accepted: { label: 'ACCEPTED', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
    bounced: { label: 'BOUNCED', cls: 'bg-red-100 text-red-800 ring-red-300' },
    revoked: { label: 'REVOKED', cls: 'bg-stone-200 text-stone-600 ring-stone-300' },
  }
  const sm = statusMeta[inv.status] ?? statusMeta.pending

  async function approve() {
    setWorking('approve')
    const res = await fetch(`/api/org/invite/${inv.id}/approve`, { method: 'POST' })
    if (res.ok) onChanged()
    setWorking(null)
  }

  async function revoke() {
    if (!confirm(`Revoke invite for ${inv.invited_email}?`)) return
    setWorking('revoke')
    const res = await fetch(`/api/org/invite/${inv.id}`, { method: 'DELETE' })
    if (res.ok) onChanged()
    setWorking(null)
  }

  return (
    <tr className="border-t border-stone-100 hover:bg-stone-50 transition">
      <td className="px-6 py-3 font-mono text-xs text-stone-800">{inv.invited_email}</td>
      <td className="px-6 py-3">
        <span
          className={`text-[9px] tracking-[0.15em] font-bold px-2 py-0.5 rounded-full ring-1 ${sm.cls}`}
        >
          {sm.label}
        </span>
      </td>
      <td className="px-6 py-3 text-xs text-stone-600">
        {new Date(inv.invited_at).toLocaleDateString()}
      </td>
      <td className="px-6 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          {inv.status === 'pending' && (
            <button
              type="button"
              onClick={approve}
              disabled={working !== null}
              className="text-xs text-emerald-700 hover:text-emerald-800 underline disabled:opacity-50"
            >
              {working === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          )}
          {inv.status !== 'accepted' && inv.status !== 'revoked' && (
            <button
              type="button"
              onClick={revoke}
              disabled={working !== null}
              className="text-xs text-red-700 hover:text-red-800 underline disabled:opacity-50"
            >
              {working === 'revoke' ? 'Revoking…' : 'Revoke'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
