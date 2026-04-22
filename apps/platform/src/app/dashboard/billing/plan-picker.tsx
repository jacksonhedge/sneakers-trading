'use client'

import { useEffect, useState } from 'react'
import {
  ADDONS,
  PLANS,
  loadAddons,
  loadTier,
  saveAddons,
  saveTier,
  type AddOnId,
  type Tier,
} from '@/lib/subscriptions'

const ACCENT_CLASSES: Record<string, { bg: string; ring: string; text: string; btn: string }> = {
  stone: {
    bg: 'bg-stone-50',
    ring: 'ring-stone-300',
    text: 'text-stone-700',
    btn: 'bg-stone-800 hover:bg-stone-900 text-white',
  },
  emerald: {
    bg: 'bg-[#00703c]/5',
    ring: 'ring-[#00703c]/40',
    text: 'text-[#004225]',
    btn: 'bg-[#00703c] hover:bg-[#004225] text-white',
  },
  amber: {
    bg: 'bg-amber-50',
    ring: 'ring-amber-400/40',
    text: 'text-amber-900',
    btn: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  violet: {
    bg: 'bg-violet-50',
    ring: 'ring-violet-400/40',
    text: 'text-violet-900',
    btn: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
}

export function PlanPicker() {
  const [tier, setTier] = useState<Tier>('free')
  const [addons, setAddons] = useState<AddOnId[]>([])
  const [mounted, setMounted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setTier(loadTier())
    setAddons(loadAddons())
    setMounted(true)
  }, [])

  function switchTier(next: Tier) {
    if (next === tier) return
    saveTier(next)
    setTier(next)
    setNotice(
      next === 'free'
        ? 'Downgraded to Free. Stripe billing isn\'t wired up yet — this is local only.'
        : `Selected ${next.toUpperCase()}. Stripe checkout isn't wired up yet — saved locally for preview.`,
    )
    setTimeout(() => setNotice(null), 4000)
  }

  function toggleAddon(id: AddOnId) {
    const next = addons.includes(id) ? addons.filter((a) => a !== id) : [...addons, id]
    saveAddons(next)
    setAddons(next)
  }

  // Legacy picker shows only the four primary tiers (no Fraternity/Enterprise
  // columns). PR2 replaces this whole component with the Stripe-backed table.
  const pickerPlans = PLANS.filter(
    (p) => p.flavor === 'free' || p.flavor === 'pro' || p.flavor === 'elite' || p.flavor === 'business',
  )
  const currentPlan = pickerPlans.find((p) => p.tier === tier)

  return (
    <div className="space-y-8">
      {notice && (
        <div className="rounded border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2 text-xs">
          {notice}
        </div>
      )}

      {/* Current plan strip */}
      {mounted && currentPlan && (
        <div className="rounded border border-stone-200 bg-white p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-stone-400 tracking-[0.15em] font-semibold mb-1">
              CURRENT PLAN
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-xl font-bold text-stone-900">{currentPlan.name}</span>
              <span className="text-sm text-stone-500">
                ${currentPlan.priceMonthly}/mo · {currentPlan.tagline}
              </span>
            </div>
            {addons.length > 0 && (
              <div className="text-xs text-stone-500 mt-1">
                Add-ons:{' '}
                {addons
                  .map((id) => ADDONS.find((a) => a.id === id)?.name)
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </div>
          <div className="text-[10px] text-stone-400">
            Billing source: <span className="text-stone-600 font-mono">localStorage</span>
          </div>
        </div>
      )}

      {/* Tiers */}
      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-3 font-semibold">
          {'>'} TIERS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {pickerPlans.map((plan) => {
            const a = ACCENT_CLASSES[plan.accent] ?? ACCENT_CLASSES.stone
            const isCurrent = mounted && tier === plan.tier
            return (
              <div
                key={plan.flavor}
                className={`rounded border ring-1 ${a.bg} ${a.ring} p-5 flex flex-col`}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className={`text-lg font-bold ${a.text}`}>{plan.name}</div>
                  {isCurrent && (
                    <span className="text-[10px] tracking-wider px-2 py-0.5 rounded-full bg-stone-900 text-white">
                      CURRENT
                    </span>
                  )}
                </div>
                <div className="text-xs text-stone-500 mb-4">{plan.tagline}</div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-bold text-stone-900">
                    ${plan.priceMonthly}
                  </span>
                  <span className="text-xs text-stone-500">/mo</span>
                </div>
                <ul className="space-y-2 text-xs text-stone-700 mb-6 flex-1">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <span className="text-emerald-600 mt-0.5">✓</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={isCurrent || !mounted}
                  onClick={() => switchTier(plan.tier)}
                  className={`w-full py-2 text-xs tracking-wider font-semibold rounded disabled:opacity-50 disabled:cursor-default transition ${a.btn}`}
                >
                  {isCurrent ? 'YOUR PLAN' : (plan.priceMonthly ?? 0) === 0 ? 'DOWNGRADE' : 'UPGRADE'}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Add-ons */}
      <section>
        <div className="text-xs text-[#004225] tracking-wider mb-3 font-semibold">
          {'>'} ADD-ONS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ADDONS.map((addon) => {
            const active = mounted && addons.includes(addon.id)
            const priceLabel =
              addon.pricing.kind === 'multiplier'
                ? `${addon.pricing.factor}× base plan`
                : `$${addon.pricing.daily.toFixed(2)}/day · $${addon.pricing.monthly.toFixed(2)}/mo`
            const requires = addon.requiresTier?.join(', ').toUpperCase()
            const canEnable = !addon.requiresTier || addon.requiresTier.includes(tier)
            return (
              <div
                key={addon.id}
                className={`rounded border border-stone-200 bg-white p-4 ${
                  active ? 'ring-1 ring-emerald-400/60' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold text-stone-900">{addon.name}</div>
                  {active && (
                    <span className="text-[10px] tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 ring-1 ring-emerald-400/40">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div className="text-xs text-stone-500 mb-2">{addon.tagline}</div>
                <div className="text-xs font-mono text-stone-700 mb-3">{priceLabel}</div>
                <ul className="space-y-1.5 text-xs text-stone-600 mb-4">
                  {addon.details.map((d) => (
                    <li key={d} className="flex items-start gap-2">
                      <span className="text-emerald-600 mt-0.5">•</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
                {requires && !canEnable && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded mb-3">
                    Requires {requires} plan
                  </div>
                )}
                <button
                  type="button"
                  disabled={!mounted || (!active && !canEnable)}
                  onClick={() => toggleAddon(addon.id)}
                  className={`w-full py-2 text-xs tracking-wider font-semibold rounded transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-stone-200 hover:bg-stone-300 text-stone-800'
                      : 'bg-stone-800 hover:bg-stone-900 text-white'
                  }`}
                >
                  {active ? 'REMOVE' : 'ADD'}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section className="text-[11px] text-stone-500 border-t border-stone-200 pt-4 space-y-2">
        <div>
          <span className="text-stone-700 font-semibold">Payments are not wired yet.</span>{' '}
          Tier + add-on selections are stored in your browser&apos;s localStorage for preview.
          When Stripe is integrated, the source of truth moves to a Supabase table keyed by
          your account, and the buttons above become a real checkout handoff.
        </div>
        <div>
          If you&apos;re an admin: the roadmap line is under <code className="bg-stone-100 px-1 rounded">Later → Payments integration</code>;
          decision on Stripe vs LemonSqueezy pending.
        </div>
      </section>
    </div>
  )
}
