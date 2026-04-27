'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const MAX_INVITES = 5
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function InviteFriendsForm({
  initialEmails,
  referralUrl,
}: {
  initialEmails: string[]
  referralUrl: string
}) {
  const router = useRouter()
  const [emails, setEmails] = useState<string[]>(() => {
    const seeded = [...initialEmails]
    while (seeded.length < MAX_INVITES) seeded.push('')
    return seeded.slice(0, MAX_INVITES)
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function setSlot(i: number, value: string) {
    setEmails((prev) => {
      const next = [...prev]
      next[i] = value
      return next
    })
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Older browsers — fall through silently. The link is shown above.
    }
  }

  async function send() {
    setBusy(true)
    setError(null)
    const cleaned = emails
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
    const invalid = cleaned.find((e) => !EMAIL_RE.test(e))
    if (invalid) {
      setBusy(false)
      setError(`"${invalid}" doesn't look like an email address.`)
      return
    }
    const res = await fetch('/api/onboarding/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invites_sent_emails: cleaned,
        current_step: 'invite-friends',
      }),
    })
    if (!res.ok) {
      setBusy(false)
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setError(body.message ?? 'Something went wrong. Try again.')
      return
    }
    router.push('/onboarding/location-check')
    router.refresh()
  }

  async function skip() {
    setBusy(true)
    setError(null)
    // Still record the step transition so resume works correctly.
    await fetch('/api/onboarding/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_step: 'invite-friends' }),
    })
    router.push('/onboarding/location-check')
    router.refresh()
  }

  const filled = emails.filter((e) => e.trim().length > 0).length

  return (
    <div className="space-y-6">
      {/* Referral link card — always visible. */}
      <div className="border border-emerald-400/30 bg-emerald-500/5 rounded p-4 space-y-2">
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold">
          YOUR LINK · NO LIMIT, SHARE EVERYWHERE
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-white/85 bg-black/40 px-3 py-2 rounded font-mono break-all">
            {referralUrl}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="text-[11px] tracking-wider text-black bg-emerald-400 hover:bg-emerald-300 px-3 py-2 rounded transition"
          >
            {copied ? 'COPIED ✓' : 'COPY'}
          </button>
        </div>
      </div>

      {/* Email-invite list */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        className="space-y-3"
      >
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold">
          OR EMAIL UP TO {MAX_INVITES} FRIENDS
        </div>
        <div className="space-y-2">
          {emails.map((value, i) => (
            <input
              key={i}
              type="email"
              placeholder={`friend${i + 1}@example.com`}
              value={value}
              onChange={(e) => setSlot(i, e.target.value)}
              autoComplete="off"
              className="w-full bg-black/40 border border-white/20 text-white px-4 py-2.5 rounded focus:outline-none focus:border-emerald-400 placeholder:text-white/30 transition text-sm"
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="submit"
            disabled={busy || filled === 0}
            className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50 tracking-wider"
          >
            {busy ? 'SAVING…' : `INVITE ${filled} →`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={skip}
            className="text-[11px] text-white/55 hover:text-white/85 underline disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
            {'>'} {error}
          </div>
        )}
      </form>

      <div className="text-[11px] text-white/50 leading-relaxed">
        We&apos;ll save these emails as your invite list. We don&apos;t spam — they&apos;ll get
        a single email when invites open up, and you can revoke any of them later from
        your profile.
      </div>
    </div>
  )
}
