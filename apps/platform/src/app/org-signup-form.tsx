'use client'

import Image from 'next/image'
import { useState } from 'react'

// 3-step org signup wizard:
//   Step 1 — pick your tier (3 cards: software / Mac Studio / MacBook Pro)
//   Step 2 — tell us about your org (org name, type, school, leader, email)
//   Step 3 — review + submit
//
// State is preserved across step navigation. The actual /api/waitlist POST
// only fires on step 3 submit.

const ORG_TYPES: Array<{ value: string; label: string }> = [
  { value: 'fraternity', label: 'Fraternity' },
  { value: 'sorority', label: 'Sorority' },
  { value: 'dorm', label: 'Dorm / house' },
  { value: 'club', label: 'Club / student org' },
  { value: 'class', label: 'Class / cohort' },
  { value: 'other', label: 'Other' },
]

type TierChoice = 'software_only' | 'hardware_mac_studio' | 'hardware_macbook_pro'

const TIER_META: Record<TierChoice, { label: string; hardware: boolean; price: string }> = {
  software_only: { label: 'Software only', hardware: false, price: '$799/mo' },
  hardware_mac_studio: { label: 'Mac Studio', hardware: true, price: '$799 + $199/mo' },
  hardware_macbook_pro: { label: 'MacBook Pro', hardware: true, price: '$799 + $199/mo' },
}

type Step = 1 | 2 | 3

export function OrgSignupForm({ referralCode }: { referralCode?: string | null }) {
  const [step, setStep] = useState<Step>(1)
  const [tier, setTier] = useState<TierChoice>('software_only')
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState('')
  const [orgCollege, setOrgCollege] = useState('')
  const [leaderName, setLeaderName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const step2Valid =
    orgName.trim().length >= 2 &&
    orgType !== '' &&
    orgCollege.trim().length >= 2 &&
    leaderName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  async function handleSubmit() {
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
    <div className="space-y-5">
      <ProgressBar current={step} />

      {step === 1 && (
        <StepTier tier={tier} setTier={setTier} onNext={() => setStep(2)} />
      )}

      {step === 2 && (
        <StepDetails
          orgName={orgName}
          setOrgName={setOrgName}
          orgType={orgType}
          setOrgType={setOrgType}
          orgCollege={orgCollege}
          setOrgCollege={setOrgCollege}
          leaderName={leaderName}
          setLeaderName={setLeaderName}
          email={email}
          setEmail={setEmail}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
          canContinue={step2Valid}
        />
      )}

      {step === 3 && (
        <StepConfirm
          tier={tier}
          orgName={orgName}
          orgType={orgType}
          orgCollege={orgCollege}
          leaderName={leaderName}
          email={email}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
          submitting={status === 'loading'}
          errorMsg={status === 'error' ? errorMsg : null}
        />
      )}
    </div>
  )
}

function ProgressBar({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2 text-[10px] tracking-[0.15em] font-semibold">
      {[1, 2, 3].map((n) => {
        const isActive = n === current
        const isDone = n < current
        return (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div
              className={`h-1 flex-1 rounded-full transition-colors ${
                isDone || isActive ? 'bg-emerald-400' : 'bg-white/15'
              }`}
            />
            <span
              className={`text-[10px] ${
                isActive ? 'text-emerald-300' : isDone ? 'text-emerald-300/60' : 'text-white/30'
              }`}
            >
              {n}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1 — pick your tier ─────────────────────────────────────────────

function StepTier({
  tier,
  setTier,
  onNext,
}: {
  tier: TierChoice
  setTier: (t: TierChoice) => void
  onNext: () => void
}) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
      <div>
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-1">
          STEP 1 OF 3
        </div>
        <h3 className="text-lg font-bold text-white">Pick your tier.</h3>
        <p className="text-xs text-white/65 mt-1">
          You can upgrade or add hardware anytime later.
        </p>
      </div>

      <TierCard
        selected={tier === 'software_only'}
        onSelect={() => setTier('software_only')}
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
          arb scanner, leaderboard.
        </div>
      </TierCard>

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
            description="Always-on terminal in the chapter house."
            imageSrc="/hardware/mac-studio.png"
          />
          <HardwareCard
            selected={tier === 'hardware_macbook_pro'}
            onSelect={() => setTier('hardware_macbook_pro')}
            label="MacBook Pro"
            tagline="On the road"
            description="Trading floor in a backpack."
            imageSrc="/hardware/macbook-pro.png"
          />
        </div>
        <div className="mt-2 rounded ring-1 ring-emerald-400/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-200/90 leading-relaxed">
          ✦ <span className="font-semibold">Local AI tools embedded.</span> Llama 3 70B + Qwen
          run on-device — your bot&apos;s strategy never leaves the house.
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 transition tracking-wider"
      >
        NEXT →
      </button>
    </div>
  )
}

// ─── Step 2 — org details ────────────────────────────────────────────────

function StepDetails({
  orgName,
  setOrgName,
  orgType,
  setOrgType,
  orgCollege,
  setOrgCollege,
  leaderName,
  setLeaderName,
  email,
  setEmail,
  onBack,
  onNext,
  canContinue,
}: {
  orgName: string
  setOrgName: (v: string) => void
  orgType: string
  setOrgType: (v: string) => void
  orgCollege: string
  setOrgCollege: (v: string) => void
  leaderName: string
  setLeaderName: (v: string) => void
  email: string
  setEmail: (v: string) => void
  onBack: () => void
  onNext: () => void
  canContinue: boolean
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canContinue) onNext()
      }}
      className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200"
    >
      <div>
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-1">
          STEP 2 OF 3
        </div>
        <h3 className="text-lg font-bold text-white">Tell us about your org.</h3>
        <p className="text-xs text-white/65 mt-1">
          Quick details so we can route you to the right onboarding cohort.
        </p>
      </div>

      <Field label="ORGANIZATION NAME" id="org-name">
        <input
          id="org-name"
          type="text"
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="SAE @ UF"
          maxLength={100}
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="TYPE" id="org-type">
          <select
            id="org-type"
            required
            value={orgType}
            onChange={(e) => setOrgType(e.target.value)}
            className={inputCls}
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
        </Field>
        <Field label="SCHOOL" id="org-college">
          <input
            id="org-college"
            type="text"
            required
            value={orgCollege}
            onChange={(e) => setOrgCollege(e.target.value)}
            placeholder="University of Florida"
            maxLength={80}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="LEADER / ADMIN NAME" id="leader-name" hint="usually you">
        <input
          id="leader-name"
          type="text"
          required
          value={leaderName}
          onChange={(e) => setLeaderName(e.target.value)}
          placeholder="Jeremy Albus"
          maxLength={100}
          className={inputCls}
        />
      </Field>

      <Field label="LEADER EMAIL" id="org-email" hint=".edu preferred">
        <input
          id="org-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="leader@school.edu"
          autoComplete="email"
          className={inputCls}
        />
      </Field>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-3 text-sm font-semibold text-white/70 hover:text-white tracking-wider"
        >
          ← BACK
        </button>
        <button
          type="submit"
          disabled={!canContinue}
          className="flex-1 bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 disabled:bg-stone-700 disabled:text-stone-400 disabled:cursor-not-allowed transition tracking-wider"
        >
          NEXT →
        </button>
      </div>
    </form>
  )
}

// ─── Step 3 — confirm + submit ───────────────────────────────────────────

function StepConfirm({
  tier,
  orgName,
  orgType,
  orgCollege,
  leaderName,
  email,
  onBack,
  onSubmit,
  submitting,
  errorMsg,
}: {
  tier: TierChoice
  orgName: string
  orgType: string
  orgCollege: string
  leaderName: string
  email: string
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
  errorMsg: string | null
}) {
  const meta = TIER_META[tier]
  const orgTypeLabel = ORG_TYPES.find((t) => t.value === orgType)?.label ?? orgType
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
      <div>
        <div className="text-[10px] tracking-[0.15em] text-emerald-300/80 font-semibold mb-1">
          STEP 3 OF 3
        </div>
        <h3 className="text-lg font-bold text-white">Looks right?</h3>
        <p className="text-xs text-white/65 mt-1">
          Submit to lock in your spot. We&apos;ll email when your trial starts.
        </p>
      </div>

      <div className="rounded-lg ring-1 ring-emerald-400/30 bg-black/40 backdrop-blur-sm p-4 space-y-3">
        <ConfirmRow label="Tier" value={`${meta.label} · ${meta.price}`} highlight />
        <ConfirmRow label="Organization" value={orgName} />
        <ConfirmRow label="Type" value={orgTypeLabel} />
        <ConfirmRow label="School" value={orgCollege} />
        <ConfirmRow label="Leader" value={leaderName} />
        <ConfirmRow label="Email" value={email} />
      </div>

      {errorMsg && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
          {'>'} {errorMsg}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="px-5 py-3 text-sm font-semibold text-white/70 hover:text-white tracking-wider disabled:opacity-50"
        >
          ← BACK
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 bg-emerald-500 text-black font-semibold px-6 py-3 rounded hover:bg-emerald-400 disabled:opacity-50 transition tracking-wider"
        >
          {submitting ? 'SAVING…' : 'SUBMIT ORG →'}
        </button>
      </div>

      <div className="text-[11px] text-white/50 text-center leading-relaxed">
        First 10 accepted orgs get bonus early access when Groups ships.
      </div>
    </div>
  )
}

function ConfirmRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-[10px] tracking-wider text-white/55 uppercase">{label}</span>
      <span
        className={`text-right font-medium truncate ${
          highlight ? 'text-emerald-300 font-bold' : 'text-white/95'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Shared bits ─────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-black/40 backdrop-blur-sm border border-white/30 text-white px-4 py-3 focus:outline-none focus:border-emerald-400 focus:bg-black/60 placeholder:text-white/40 transition rounded'

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string
  id: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] tracking-wider text-emerald-300/80 mb-1"
      >
        {label}
        {hint && <span className="text-white/40 normal-case ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

function TierCard({
  selected,
  onSelect,
  children,
}: {
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg p-4 transition ${
        selected
          ? 'bg-emerald-500/10 ring-2 ring-emerald-400'
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
        selected ? 'ring-emerald-400 bg-emerald-400' : 'ring-white/30 bg-transparent'
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
