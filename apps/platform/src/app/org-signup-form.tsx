'use client'

import Image from 'next/image'
import { useState } from 'react'

// Organization signup with tier picker. Three options:
//   - software_only: $799/mo, 14-day free trial, cloud AI only
//   - hardware_mac_studio: $799 + $199/mo, common-room install, local AI
//   - hardware_macbook_pro: $799 + $199/mo, mobile, local AI
//
// Posts to /api/waitlist with accountType='business'. The tier choice is
// encoded into org_description for now (column on organization_signups);
// a follow-up migration will split it into proper columns.

const ORG_TYPES: Array<{ value: string; label: string }> = [
  { value: 'fraternity', label: 'Fraternity' },
  { value: 'sorority', label: 'Sorority' },
  { value: 'dorm', label: 'Dorm / house' },
  { value: 'club', label: 'Club / student org' },
  { value: 'class', label: 'Class / cohort' },
  { value: 'other', label: 'Other' },
]

type TierChoice = 'software_only' | 'hardware_mac_studio' | 'hardware_macbook_pro'

interface TierMeta {
  id: TierChoice
  hardware: boolean
  label: string
}

const TIER_META: Record<TierChoice, TierMeta> = {
  software_only: { id: 'software_only', hardware: false, label: 'Software only' },
  hardware_mac_studio: { id: 'hardware_mac_studio', hardware: true, label: 'Mac Studio' },
  hardware_macbook_pro: { id: 'hardware_macbook_pro', hardware: true, label: 'MacBook Pro' },
}

export function OrgSignupForm({ referralCode }: { referralCode?: string | null }) {
  const [tier, setTier] = useState<TierChoice>('software_only')
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

    const tierLabel = TIER_META[tier].label
    const description = `tier=${tier}; selected=${tierLabel}`

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
        orgDescription: description,
        orgTier: tier,
      }),
    })
    if (!res.ok) {
      setStatus('error')
      setErrorMsg('Something broke. Try again in a moment.')
      return
    }
    setStatus('done')
  }

  if (status === 'done') {
    return <DoneCard orgName={orgName} tier={tier} />
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* SECTION 1 — Software-only tier card */}
      <div>
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-2">
          PICK YOUR TIER
        </div>
        <TierCard
          selected={tier === 'software_only'}
          onSelect={() => setTier('software_only')}
          accent="amber"
        >
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <div className="text-base font-bold text-white">Software only</div>
            <div className="text-right">
              <div className="text-base font-bold text-white font-mono tabular-nums">
                $799<span className="text-xs text-white/60 font-normal">/mo</span>
              </div>
              <div className="text-[10px] text-emerald-300/90 font-semibold tracking-wider">
                14-DAY FREE TRIAL
              </div>
            </div>
          </div>
          <div className="text-xs text-white/70 leading-relaxed">
            Full Sneakers terminal for up to 25 brothers. Cloud O&apos;Toole, all signals,
            arb scanner, leaderboard, autotrade-ready.
          </div>
          <div className="text-[10px] text-white/55 mt-1.5">
            Local AI tools require the hardware tier below.
          </div>
        </TierCard>
      </div>

      {/* SECTION 2 — Sneakers Terminal hardware tiers */}
      <div>
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-2">
          SNEAKERS TERMINAL <span className="text-white/40 normal-case">(hardware bundle)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <HardwareCard
            selected={tier === 'hardware_mac_studio'}
            onSelect={() => setTier('hardware_mac_studio')}
            label="Mac Studio"
            tagline="Common-room install"
            description="Always-on terminal in the chapter house. Plug in once, never unplug."
            imageSrc="/hardware/mac-studio.png"
          />
          <HardwareCard
            selected={tier === 'hardware_macbook_pro'}
            onSelect={() => setTier('hardware_macbook_pro')}
            label="MacBook Pro"
            tagline="On the road"
            description="Trading floor in a backpack. Library, Vegas trip, away games."
            imageSrc="/hardware/macbook-pro.png"
          />
        </div>
        <div className="mt-2 rounded ring-1 ring-emerald-400/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-200/90 leading-relaxed">
          ✦ <span className="font-semibold">Local AI tools embedded.</span> Llama 3 70B + Qwen
          run on-device — your bot&apos;s strategy never leaves the house.
        </div>
      </div>

      {/* Org details */}
      <div className="space-y-3 pt-2 border-t border-white/10">
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
            className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition rounded"
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
              className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 transition rounded"
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
              className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition rounded"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="leader-name"
            className="block text-[11px] tracking-wider text-emerald-300/80 mb-1"
          >
            LEADER / ADMIN NAME{' '}
            <span className="text-white/40 normal-case">(usually you)</span>
          </label>
          <input
            id="leader-name"
            type="text"
            required
            value={leaderName}
            onChange={(e) => setLeaderName(e.target.value)}
            placeholder="Jeremy Albus"
            maxLength={100}
            className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition rounded"
          />
        </div>

        <div>
          <label
            htmlFor="org-email"
            className="block text-[11px] tracking-wider text-emerald-300/80 mb-1"
          >
            LEADER EMAIL{' '}
            <span className="text-white/40 normal-case">(.edu preferred)</span>
          </label>
          <input
            id="org-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="leader@school.edu"
            autoComplete="email"
            className="w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition rounded"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={status === 'loading'}
        className="w-full border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50 tracking-wider"
      >
        {status === 'loading' ? 'SAVING…' : `SUBMIT — ${TIER_META[tier].label.toUpperCase()} →`}
      </button>

      <div className="text-[11px] text-white/50 text-center leading-relaxed">
        We&apos;ll review every org signup. First 10 accepted groups get bonus early access
        when the Groups feature ships. Hardware ships after we approve the org.
      </div>

      {status === 'error' && errorMsg && (
        <div className="text-xs text-red-300">{'>'} {errorMsg}</div>
      )}
    </form>
  )
}

function TierCard({
  selected,
  onSelect,
  children,
  accent,
}: {
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
  accent?: 'amber' | 'emerald'
}) {
  const accentClass = accent === 'amber' ? 'ring-amber-400/50' : 'ring-emerald-400/50'
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg p-4 transition ${
        selected
          ? `bg-emerald-500/10 ring-2 ring-emerald-400 ${accentClass}`
          : 'bg-black/40 ring-1 ring-white/15 hover:ring-white/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <Radio selected={selected} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </button>
  )
}

function HardwareCard({
  selected,
  onSelect,
  label,
  tagline,
  description,
  imageSrc,
}: {
  selected: boolean
  onSelect: () => void
  label: string
  tagline: string
  description: string
  imageSrc: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-lg overflow-hidden transition ${
        selected
          ? 'ring-2 ring-emerald-400 bg-emerald-500/10'
          : 'ring-1 ring-white/15 bg-black/40 hover:ring-white/40'
      }`}
    >
      <div className="relative aspect-[4/3] bg-stone-950">
        <Image
          src={imageSrc}
          alt={label}
          fill
          sizes="(max-width: 640px) 100vw, 200px"
          className="object-contain p-2"
        />
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Radio selected={selected} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white leading-tight">{label}</div>
            <div className="text-[10px] tracking-wider text-emerald-300/80 font-semibold mt-0.5">
              {tagline.toUpperCase()}
            </div>
          </div>
        </div>
        <div className="text-[11px] text-white/65 leading-relaxed">{description}</div>
        <div className="flex items-baseline justify-between pt-2 border-t border-white/10">
          <span className="text-[10px] text-white/50 tracking-wider">+HARDWARE</span>
          <span className="text-sm font-bold text-white font-mono tabular-nums">
            +$199<span className="text-[10px] text-white/60 font-normal">/mo</span>
          </span>
        </div>
      </div>
    </button>
  )
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <div
      className={`mt-1 flex-shrink-0 w-4 h-4 rounded-full ring-2 transition ${
        selected
          ? 'ring-emerald-400 bg-emerald-400'
          : 'ring-white/30 bg-transparent'
      }`}
      aria-hidden
    >
      {selected && (
        <div className="w-full h-full rounded-full flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-stone-950" />
        </div>
      )}
    </div>
  )
}

function DoneCard({ orgName, tier }: { orgName: string; tier: TierChoice }) {
  const isHardware = TIER_META[tier].hardware
  const hardwareLabel = TIER_META[tier].label
  return (
    <div className="border border-emerald-400/60 bg-black/60 backdrop-blur-sm p-5 text-white space-y-3 rounded-lg">
      <div className="text-sm text-emerald-300">{'>'} Your org is on the list.</div>
      <div className="text-sm text-white/85 leading-relaxed">
        <span className="text-emerald-300 font-semibold">{orgName}</span> is queued up under
        the{' '}
        <span className="text-emerald-300 font-semibold">
          {isHardware ? `${hardwareLabel} hardware tier` : 'Software-only tier'}
        </span>
        . As the leader you&apos;ll be the captain when we onboard — we&apos;ll email you
        with invite links for your members once we&apos;re ready to bring on groups.
      </div>

      {isHardware ? (
        <div className="rounded-lg ring-1 ring-emerald-400/40 bg-gradient-to-br from-emerald-950/60 to-stone-900/60 px-4 py-3 space-y-2">
          <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold">
            HARDWARE SHIPMENT
          </div>
          <div className="text-sm text-white">
            We&apos;ll ship your{' '}
            <span className="text-emerald-300 font-semibold">{hardwareLabel}</span> within 5
            business days of approving your org. Pre-loaded with Sneakers + local AI models
            (Llama 3 70B, Qwen). Plug in, log in, trade.
          </div>
        </div>
      ) : (
        <div className="rounded-lg ring-1 ring-amber-400/30 bg-amber-500/5 px-4 py-3 space-y-2">
          <div className="text-[10px] tracking-[0.15em] text-amber-300 font-semibold">
            14-DAY FREE TRIAL
          </div>
          <div className="text-sm text-white/85">
            No card today. We&apos;ll email when your trial starts so you can invite your
            first 25 brothers. Want hardware later? Upgrade anytime.
          </div>
        </div>
      )}

      <a
        href="/login"
        className="block w-full text-center border border-emerald-400 bg-emerald-500 text-black text-sm font-semibold tracking-wider px-6 py-3 hover:bg-emerald-400 transition rounded"
      >
        CONTINUE TO SIGN IN →
      </a>
    </div>
  )
}
