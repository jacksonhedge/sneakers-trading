'use client'

import { useState, useTransition } from 'react'
import { adjustCreditsAction, setUserTierAction } from './actions'

// Panel for adjusting per-user account state — O'Toole credit balance
// and plan tier. Both writes are audit-logged on the server side
// (admin_audit_events: 'adjust_credits' / 'set_user_tier'). Each panel
// has a reason field that's required and recorded in both the
// credit_transactions row (description) and the audit row's metadata.
//
// Two-step confirm pattern matching the rest of the user-detail page:
// first click arms, second click submits. Cancel resets.

type Tier = 'free' | 'pro' | 'elite' | 'business'
type Result = { ok: boolean; message: string } | null

export function AccountPanel({
  email,
  currentBalance,
  currentTier,
  hasAuthUser,
}: {
  email: string
  currentBalance: number
  currentTier: Tier
  hasAuthUser: boolean
}) {
  return (
    <div className="space-y-4">
      <CreditAdjuster email={email} currentBalance={currentBalance} hasAuthUser={hasAuthUser} />
      <TierAdjuster email={email} currentTier={currentTier} />
    </div>
  )
}

// ---------- credits ----------

function CreditAdjuster({
  email,
  currentBalance,
  hasAuthUser,
}: {
  email: string
  currentBalance: number
  hasAuthUser: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [armed, setArmed] = useState(false)
  const [result, setResult] = useState<Result>(null)

  const deltaNum = parseInt(delta, 10)
  const validDelta = Number.isFinite(deltaNum) && deltaNum !== 0
  const validReason = reason.trim().length > 0
  const canArm = validDelta && validReason && hasAuthUser

  function arm() {
    setResult(null)
    setArmed(true)
  }

  function submit() {
    const fd = new FormData()
    fd.set('email', email)
    fd.set('delta', String(deltaNum))
    fd.set('reason', reason.trim())
    startTransition(async () => {
      const r = await adjustCreditsAction(fd)
      setResult(r)
      if (r.ok) {
        setDelta('')
        setReason('')
      }
      setArmed(false)
    })
  }

  return (
    <div className="border border-stone-300 bg-white p-4">
      <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} O&apos;TOOLE CREDITS</div>
      <div className="text-sm text-stone-700 mb-3">
        Current balance:{' '}
        <span className="font-mono text-stone-900 font-semibold tabular-nums">
          {currentBalance.toLocaleString()}
        </span>{' '}
        credits
      </div>

      {!hasAuthUser ? (
        <div className="text-xs text-stone-500 italic">
          User hasn&apos;t signed in yet — credit balance is bound to the auth.users row.
          Once they sign in, this panel can adjust their balance.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-2 items-start">
            <input
              type="number"
              value={delta}
              onChange={(e) => {
                setDelta(e.target.value)
                setArmed(false)
              }}
              placeholder="±delta (e.g. 10000)"
              className="border border-stone-300 px-3 py-1.5 text-sm font-mono"
              step="1"
            />
            <input
              type="text"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setArmed(false)
              }}
              placeholder="reason (required for audit trail)"
              maxLength={500}
              className="border border-stone-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {!armed ? (
              <button
                type="button"
                disabled={!canArm || pending}
                onClick={arm}
                className="text-xs px-3 py-1.5 tracking-wider bg-[#00703c] text-white hover:bg-[#005a30] transition disabled:opacity-30"
              >
                {validDelta && deltaNum > 0
                  ? `ADD ${deltaNum.toLocaleString()} CREDITS`
                  : validDelta && deltaNum < 0
                    ? `SUBTRACT ${Math.abs(deltaNum).toLocaleString()} CREDITS`
                    : 'ADJUST'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={submit}
                  className={`text-xs px-3 py-1.5 tracking-wider text-white transition disabled:opacity-50 ${
                    deltaNum < 0 ? 'bg-red-700 hover:bg-red-800' : 'bg-[#004225] hover:bg-[#002914]'
                  }`}
                >
                  {pending
                    ? 'WORKING…'
                    : `CONFIRM → balance ${(currentBalance + deltaNum).toLocaleString()}`}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setArmed(false)}
                  className="text-xs text-stone-500 hover:underline"
                >
                  cancel
                </button>
              </>
            )}
            {!hasAuthUser && (
              <span className="text-[10px] text-stone-400">(no auth.users row)</span>
            )}
          </div>
          {result && (
            <div
              className={`text-xs px-3 py-2 inline-block ${
                result.ok
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {result.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- tier ----------

const TIER_OPTIONS: Array<{ value: Tier; label: string; cls: string }> = [
  { value: 'free', label: 'Free', cls: 'bg-stone-200 text-stone-700' },
  { value: 'pro', label: 'Pro', cls: 'bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-400/40' },
  { value: 'elite', label: 'Elite', cls: 'bg-amber-500/20 text-amber-700 ring-1 ring-amber-400/40' },
  { value: 'business', label: 'Business', cls: 'bg-violet-500/20 text-violet-700 ring-1 ring-violet-400/40' },
]

function TierAdjuster({
  email,
  currentTier,
}: {
  email: string
  currentTier: Tier
}) {
  const [pending, startTransition] = useTransition()
  const [target, setTarget] = useState<Tier>(currentTier)
  const [reason, setReason] = useState('')
  const [armed, setArmed] = useState(false)
  const [result, setResult] = useState<Result>(null)

  const changed = target !== currentTier
  const validReason = reason.trim().length > 0
  const canArm = changed && validReason

  function submit() {
    const fd = new FormData()
    fd.set('email', email)
    fd.set('tier', target)
    fd.set('reason', reason.trim())
    startTransition(async () => {
      const r = await setUserTierAction(fd)
      setResult(r)
      if (r.ok) setReason('')
      setArmed(false)
    })
  }

  return (
    <div className="border border-stone-300 bg-white p-4">
      <div className="text-xs text-[#004225] tracking-wider mb-2">{'>'} PLAN TIER</div>
      <div className="text-sm text-stone-700 mb-3">
        Current tier:{' '}
        {(() => {
          const meta = TIER_OPTIONS.find((t) => t.value === currentTier) ?? TIER_OPTIONS[0]
          return (
            <span className={`inline-block px-2 py-0.5 text-[10px] tracking-wider ${meta.cls}`}>
              {meta.label.toUpperCase()}
            </span>
          )
        })()}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-stone-500 tracking-wider w-12">SET TO</span>
          {TIER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setTarget(opt.value)
                setArmed(false)
              }}
              className={`px-3 py-1.5 text-xs tracking-wider transition ${
                target === opt.value
                  ? 'bg-[#00703c] text-white'
                  : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50'
              }`}
            >
              {opt.label.toUpperCase()}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value)
            setArmed(false)
          }}
          placeholder="reason (required for audit trail — e.g. comped for testing)"
          maxLength={500}
          className="w-full border border-stone-300 px-3 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-2 items-center">
          {!armed ? (
            <button
              type="button"
              disabled={!canArm || pending}
              onClick={() => {
                setResult(null)
                setArmed(true)
              }}
              className="text-xs px-3 py-1.5 tracking-wider bg-[#00703c] text-white hover:bg-[#005a30] transition disabled:opacity-30"
            >
              {changed
                ? `CHANGE TIER → ${target.toUpperCase()}`
                : 'NO CHANGE (PICK A DIFFERENT TIER)'}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={submit}
                className="text-xs px-3 py-1.5 tracking-wider bg-[#004225] text-white hover:bg-[#002914] transition disabled:opacity-50"
              >
                {pending ? 'WORKING…' : `CONFIRM → ${currentTier} → ${target}`}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setArmed(false)}
                className="text-xs text-stone-500 hover:underline"
              >
                cancel
              </button>
            </>
          )}
          <span className="text-[10px] text-stone-400 ml-1">
            Stripe webhook overwrites this on next subscription event
          </span>
        </div>
        {result && (
          <div
            className={`text-xs px-3 py-2 inline-block ${
              result.ok
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {result.message}
          </div>
        )}
      </div>
    </div>
  )
}
