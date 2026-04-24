'use client'

import Image from 'next/image'
import { useState } from 'react'

// Organization signup form. Sibling to LandingForm — both POST to
// /api/waitlist but this one carries extra org-specific fields (org name,
// type, leader, college) so we know who we're onboarding as a group.
//
// On success shows the same scarcity pitch but reframed for the captain:
// "Your frat/club is on the list. You'll be the captain — we'll email
// when we're ready to onboard the rest."

const ORG_TYPES: Array<{ value: string; label: string }> = [
  { value: 'fraternity', label: 'Fraternity' },
  { value: 'sorority', label: 'Sorority' },
  { value: 'dorm', label: 'Dorm / house' },
  { value: 'club', label: 'Club / student org' },
  { value: 'class', label: 'Class / cohort' },
  { value: 'other', label: 'Other' },
]

export function OrgSignupForm({ referralCode }: { referralCode?: string | null }) {
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState('')
  const [orgCollege, setOrgCollege] = useState('')
  const [leaderName, setLeaderName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg(null)

    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        source: 'landing_org',
        referralCode: referralCode ?? null,
        accountType: 'business',
        companyName: orgName.trim(),
        orgType: orgType || null,
        orgLeaderName: leaderName.trim(),
        orgCollege: orgCollege.trim(),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      existing?: boolean
      ok?: boolean
      error?: string
    }
    if (!res.ok) {
      setStatus('error')
      setErrorMsg('Something broke. Try again in a moment.')
      return
    }
    setStatus('done')
  }

  if (status === 'done') {
    return (
      <div className="border border-emerald-400/60 bg-black/60 backdrop-blur-sm p-5 text-white space-y-3">
        <div className="text-sm text-emerald-300">{'>'} Your org is on the list.</div>
        <div className="text-sm text-white/85 leading-relaxed">
          <span className="text-emerald-300 font-semibold">{orgName}</span> is queued up. As the
          leader you&apos;ll be the captain when we onboard — we&apos;ll email you with
          invite links for your members once we&apos;re ready to bring on groups.
        </div>

        {/* Hardware tease — orgs are the primary audience for the Mac
            Studio / MacBook Pro install. Surface it here with imagery
            while their interest is highest. */}
        <a
          href="/hardware"
          className="block rounded-lg ring-1 ring-emerald-400/40 bg-gradient-to-br from-emerald-950/60 to-stone-900/60 hover:ring-emerald-400 hover:from-emerald-950 hover:to-stone-900 transition group overflow-hidden"
        >
          <div className="grid grid-cols-2 gap-0">
            <div className="relative aspect-[4/3] bg-stone-950">
              <Image
                src="/hardware/mac-studio.png"
                alt="Mac Studio"
                fill
                sizes="200px"
                className="object-contain p-2"
              />
            </div>
            <div className="relative aspect-[4/3] bg-stone-950">
              <Image
                src="/hardware/macbook-pro.png"
                alt="MacBook Pro"
                fill
                sizes="200px"
                className="object-contain p-2"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-emerald-400/20">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-0.5">
                OPTIONAL · LOOK AT THIS
              </div>
              <div className="text-sm font-semibold text-white">
                A Mac, set up by us, shipped to your house
              </div>
              <div className="text-[11px] text-white/65 mt-0.5">
                Mac Studio or MacBook Pro pre-loaded with Sneakers. +$199/mo.
              </div>
            </div>
            <span className="text-emerald-300 group-hover:text-emerald-200 text-xl">→</span>
          </div>
        </a>

        <div className="pt-3 border-t border-emerald-400/20 text-xs text-white/65 leading-relaxed">
          In the meantime: share your team&apos;s move with the group chat. First 10 groups
          accepted get extra early access to the Groups feature + group-vs-group
          leaderboards.
        </div>
        <a
          href="/login"
          className="block w-full text-center border border-emerald-400 bg-emerald-500 text-black text-sm font-semibold tracking-wider px-6 py-3 hover:bg-emerald-400 transition mt-2"
        >
          CONTINUE TO SIGN IN →
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label
          htmlFor="org-name"
          className="block text-[11px] tracking-wider text-emerald-300/80 mb-1"
        >
          ORGANIZATION NAME
        </label>
        <input
          id="org-name"
          type="text"
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="SAE @ UF"
          maxLength={100}
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="org-type"
            className="block text-[11px] tracking-wider text-emerald-300/80 mb-1"
          >
            TYPE
          </label>
          <select
            id="org-type"
            required
            value={orgType}
            onChange={(e) => setOrgType(e.target.value)}
            className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 transition"
          >
            <option value="" disabled className="bg-stone-900">
              Pick one
            </option>
            {ORG_TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-stone-900">
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="org-college"
            className="block text-[11px] tracking-wider text-emerald-300/80 mb-1"
          >
            SCHOOL
          </label>
          <input
            id="org-college"
            type="text"
            required
            value={orgCollege}
            onChange={(e) => setOrgCollege(e.target.value)}
            placeholder="University of Florida"
            maxLength={80}
            className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="leader-name"
          className="block text-[11px] tracking-wider text-emerald-300/80 mb-1"
        >
          LEADER / ADMIN NAME <span className="text-white/40 normal-case">(usually you)</span>
        </label>
        <input
          id="leader-name"
          type="text"
          required
          value={leaderName}
          onChange={(e) => setLeaderName(e.target.value)}
          placeholder="Jeremy Albus"
          maxLength={100}
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
        />
      </div>

      <div>
        <label
          htmlFor="org-email"
          className="block text-[11px] tracking-wider text-emerald-300/80 mb-1"
        >
          LEADER EMAIL <span className="text-white/40 normal-case">(.edu preferred)</span>
        </label>
        <input
          id="org-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="leader@school.edu"
          autoComplete="email"
          className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50 tracking-wider"
      >
        {status === 'loading' ? 'SAVING…' : 'SUBMIT ORG →'}
      </button>

      <div className="text-[11px] text-white/50 text-center leading-relaxed">
        We&apos;ll review every org signup. First 10 accepted groups get bonus early access
        when the Groups feature ships.
      </div>

      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-300">{'>'} {errorMsg}</div>
      )}
    </form>
  )
}
