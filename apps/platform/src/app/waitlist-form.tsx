'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type AccountType = 'individual' | 'business'

interface SuccessPayload {
  position: number
  referralCode: string
  inviteSlotsTotal: number
  directReferrals: number
}

export function WaitlistForm({ referralCode }: { referralCode?: string | null }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('individual')
  const [companyName, setCompanyName] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'admin' | 'error'>('idle')
  const [success, setSuccess] = useState<SuccessPayload | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        source: 'landing',
        referralCode: referralCode ?? null,
        accountType,
        companyName: accountType === 'business' ? companyName.trim() || null : null,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      admin?: boolean
      existing?: boolean
      position?: number
      referralCode?: string
      inviteSlotsTotal?: number
      directReferrals?: number
    }
    if (res.ok) {
      if (data.admin) {
        setStatus('admin')
      } else if (data.existing) {
        // Email is already on the waitlist. Don't silently show "access requested"
        // — route them to /login where they can see their position + get a magic
        // link if they've already been invited.
        router.push(`/login?email=${encodeURIComponent(email.toLowerCase().trim())}`)
      } else {
        if (
          typeof data.position === 'number' &&
          typeof data.referralCode === 'string' &&
          typeof data.inviteSlotsTotal === 'number' &&
          typeof data.directReferrals === 'number'
        ) {
          setSuccess({
            position: data.position,
            referralCode: data.referralCode,
            inviteSlotsTotal: data.inviteSlotsTotal,
            directReferrals: data.directReferrals,
          })
        }
        setStatus('done')
        router.refresh()
      }
    } else {
      setStatus('error')
    }
  }

  if (status === 'admin') {
    return (
      <div className="border border-emerald-400/80 bg-black/60 backdrop-blur-sm p-4 text-white">
        <div className="text-sm text-emerald-300">{'>'} Admin recognized.</div>
        <div className="text-xs text-white/80 mt-1">
          Magic link sent to your inbox. Click it to sign in — you&apos;ll land
          directly on <span className="text-emerald-400 font-semibold">/admin</span>.
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return <SuccessCard payload={success} referrerCode={referralCode} />
  }

  return (
    <div className="space-y-3">
      {/* Account type toggle */}
      <div className="flex items-center gap-1 rounded-full bg-black/40 p-1 w-fit mx-auto backdrop-blur-sm border border-white/20">
        <button
          type="button"
          onClick={() => setAccountType('individual')}
          className={`px-4 py-1 text-[11px] tracking-wider rounded-full transition ${
            accountType === 'individual'
              ? 'bg-emerald-500 text-black font-semibold'
              : 'text-white/70 hover:text-white'
          }`}
        >
          INDIVIDUAL
        </button>
        <button
          type="button"
          onClick={() => setAccountType('business')}
          className={`px-4 py-1 text-[11px] tracking-wider rounded-full transition ${
            accountType === 'business'
              ? 'bg-emerald-500 text-black font-semibold'
              : 'text-white/70 hover:text-white'
          }`}
        >
          BUSINESS
        </button>
      </div>

      <form onSubmit={submit} className="space-y-2">
        {accountType === 'business' && (
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Company or fund name (optional)"
            className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
          />
        )}
        <div className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={accountType === 'business' ? 'you@firm.com' : 'you@example.com'}
            className="flex-1 bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
          />
          <button
            type="submit"
            disabled={status === 'loading'}
            className="border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50"
          >
            {status === 'loading' ? '...' : 'REQUEST ACCESS'}
          </button>
        </div>
        {accountType === 'business' && (
          <div className="text-[11px] text-emerald-300/80 text-center">
            Business accounts get priority review + early Business-tier access.
          </div>
        )}
      </form>
      {status === 'error' && (
        <div className="text-xs text-red-300">
          {'>'} Error. Try again in a moment.
        </div>
      )}
    </div>
  )
}

function SuccessCard({
  payload,
  referrerCode,
}: {
  payload: SuccessPayload | null
  referrerCode?: string | null
}) {
  const [copied, setCopied] = useState(false)
  const position = payload?.position
  const referralCode = payload?.referralCode
  const slotsTotal = payload?.inviteSlotsTotal ?? 3
  const used = payload?.directReferrals ?? 0
  const remaining = Math.max(0, slotsTotal - used)
  const link = referralCode ? `https://sneakersterminal.com/r/${referralCode}` : null

  function copy() {
    if (!link) return
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="border border-emerald-400/60 bg-black/60 backdrop-blur-sm p-5 text-white space-y-4">
      <div>
        <div className="text-sm text-emerald-300">{'>'} Access requested.</div>
        {typeof position === 'number' && (
          <div className="text-xs text-white/70 mt-1">
            You&apos;re{' '}
            <span className="text-emerald-400 font-semibold">#{position}</span> in
            the queue.
            {referrerCode && (
              <>
                {' '}Operator{' '}
                <span className="text-emerald-400 font-semibold">{referrerCode}</span>{' '}
                just moved up.
              </>
            )}
          </div>
        )}
      </div>

      {/* Invite slots */}
      <div className="border-t border-emerald-400/20 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] tracking-wider text-emerald-300/80">
            YOUR INVITES
          </div>
          <div className="text-[11px] text-white/60 tabular-nums">
            {remaining} of {slotsTotal}
          </div>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: slotsTotal }).map((_, i) => {
            const filled = i < used
            return (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  filled
                    ? 'bg-emerald-500/30'
                    : 'bg-emerald-500 ring-1 ring-emerald-300/40'
                }`}
                aria-label={filled ? 'Invite used' : 'Invite available'}
              />
            )
          })}
        </div>
      </div>

      {/* Share link */}
      {link && (
        <div className="border-t border-emerald-400/20 pt-4">
          <div className="text-[11px] tracking-wider text-emerald-300/80 mb-2">
            YOUR LINK
          </div>
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-black/50 border border-white/20 text-white/90 text-xs px-3 py-2 font-mono focus:outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={copy}
              className="border border-emerald-400 bg-emerald-500 text-black text-[11px] font-semibold tracking-wider px-3 py-2 hover:bg-emerald-400 transition"
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
          </div>
          <div className="text-[11px] text-white/50 mt-2">
            Each signup through this link moves you up 5 spots + claims one of
            your invites.
          </div>
        </div>
      )}
    </div>
  )
}
