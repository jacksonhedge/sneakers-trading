'use client'

import { useState, useTransition } from 'react'
import {
  PLANS,
  STRIPE_PRICES,
  yearlySavings,
  type AccountType,
  type BillingFlavor,
  type BillingInterval,
  type Tier,
  type TierPlan,
} from '@/lib/subscriptions'
import { ContactSalesForm } from './contact-sales-form'

// Stripe-backed pricing table. Replaces the old localStorage plan-picker.
//
// Renders one column per BillingFlavor (Free, Pro, Elite, Business,
// Fraternity, Enterprise). Account-type gating keeps a user from
// subscribing to a column that doesn't match their account_type — those
// columns get a disabled CTA with a tooltip rather than being hidden.
//
// CTA matrix:
//   Free, current = nothing      → "Current plan" (disabled)
//   Free, current = paid         → "Manage subscription" (Portal: cancel from there)
//   Paid, current = same flavor  → "Current plan" + Manage link
//   Paid, current = other paid   → "Switch plan" (Portal handles the swap)
//   Paid, no current sub         → "Start N-day trial" → /api/stripe/checkout
//   Enterprise                   → "Contact Sales" → inline form (no Stripe)
//   Public page (no user)        → "Sign up" → /signup

export interface PricingTableViewer {
  email: string | null
  tier: Tier
  isActive: boolean
  accountType: AccountType | null
  hasStripeCustomer: boolean
  studentDiscountApproved: boolean
}

const ACCENT: Record<string, { ring: string; bg: string; text: string; btn: string }> = {
  stone:   { ring: 'ring-stone-300',     bg: 'bg-stone-50',         text: 'text-stone-700',     btn: 'bg-stone-800 hover:bg-stone-900 text-white' },
  emerald: { ring: 'ring-[#00703c]/40',  bg: 'bg-[#00703c]/5',      text: 'text-[#004225]',     btn: 'bg-[#00703c] hover:bg-[#004225] text-white' },
  amber:   { ring: 'ring-amber-400/40',  bg: 'bg-amber-50',         text: 'text-amber-800',     btn: 'bg-amber-600 hover:bg-amber-700 text-white' },
  violet:  { ring: 'ring-violet-400/40', bg: 'bg-violet-50',        text: 'text-violet-800',    btn: 'bg-violet-700 hover:bg-violet-800 text-white' },
  sky:     { ring: 'ring-sky-400/40',    bg: 'bg-sky-50',           text: 'text-sky-800',       btn: 'bg-sky-700 hover:bg-sky-800 text-white' },
  zinc:    { ring: 'ring-zinc-400/40',   bg: 'bg-zinc-50',          text: 'text-zinc-800',      btn: 'bg-zinc-800 hover:bg-zinc-900 text-white' },
}

interface Props {
  viewer: PricingTableViewer | null  // null = public, no user signed in
  /** Hide the inline currentPlan strip (used on /pricing where we don't know enough). */
  hideCurrentPlanStrip?: boolean
}

export function PricingTable({ viewer, hideCurrentPlanStrip }: Props) {
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [contactSalesOpen, setContactSalesOpen] = useState(false)

  const isAuthed = viewer?.email != null
  const currentFlavorMatch = viewer
    ? PLANS.find(
        (p) => p.tier === viewer.tier && (p.subtype ?? 'standard') === 'standard' && p.flavor !== 'enterprise',
      )
    : null

  function handleSubscribe(plan: TierPlan) {
    if (!isAuthed) {
      window.location.href = `/signup?next=/dashboard/billing`
      return
    }
    setError(null)
    const priceId = STRIPE_PRICES[plan.flavor as Exclude<BillingFlavor, 'free' | 'enterprise'>]?.[interval]
    if (!priceId) {
      setError(
        `${plan.name} ${interval} is not configured. Set NEXT_PUBLIC_STRIPE_PRICE_${plan.flavor.toUpperCase()}_${interval.toUpperCase()} in .env.local — see docs/stripe-setup.md.`,
      )
      return
    }
    startTransition(async () => {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priceId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { message?: string }))
        setError(body.message ?? `Checkout failed (${res.status})`)
        return
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    })
  }

  function handlePortal() {
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { message?: string }))
        setError(body.message ?? `Portal failed (${res.status})`)
        return
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    })
  }

  return (
    <div className="space-y-6">
      {/* Interval toggle */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setInterval('monthly')}
          className={`px-4 py-1.5 text-xs tracking-wider font-semibold rounded-l border ${
            interval === 'monthly'
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
          }`}
        >
          MONTHLY
        </button>
        <button
          type="button"
          onClick={() => setInterval('yearly')}
          className={`px-4 py-1.5 text-xs tracking-wider font-semibold rounded-r border ${
            interval === 'yearly'
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
          } -ml-3`}
        >
          ANNUAL <span className="text-emerald-400 ml-1">SAVE ~17%</span>
        </button>
      </div>

      {/* Current-plan strip */}
      {!hideCurrentPlanStrip && currentFlavorMatch && viewer && (
        <div className="rounded border border-stone-200 bg-white p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-stone-400 tracking-[0.15em] font-semibold mb-1">
              CURRENT PLAN
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-xl font-bold text-stone-900">{currentFlavorMatch.name}</span>
              <span className="text-sm text-stone-500">{currentFlavorMatch.tagline}</span>
              {!viewer.isActive && viewer.tier !== 'free' && (
                <span className="text-[10px] tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  PAYMENT NEEDS ATTENTION
                </span>
              )}
            </div>
          </div>
          {viewer.hasStripeCustomer && (
            <button
              type="button"
              onClick={handlePortal}
              disabled={busy}
              className="text-xs tracking-wider font-semibold px-3 py-2 rounded border border-stone-300 hover:bg-stone-50 disabled:opacity-50"
            >
              MANAGE
            </button>
          )}
        </div>
      )}

      {/* Student-discount badge */}
      {viewer?.studentDiscountApproved && (
        <div className="rounded border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-2 text-xs">
          ✓ 75% student discount will be applied at checkout for Pro and Elite.
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 text-red-800 px-4 py-2 text-xs">
          {error}
        </div>
      )}

      {/* Pricing columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {PLANS.map((plan) => (
          <PricingColumn
            key={plan.flavor}
            plan={plan}
            interval={interval}
            viewer={viewer}
            currentFlavor={currentFlavorMatch?.flavor ?? null}
            busy={busy}
            onSubscribe={() => handleSubscribe(plan)}
            onManage={handlePortal}
            onContactSales={() => setContactSalesOpen(true)}
          />
        ))}
      </div>

      {contactSalesOpen && (
        <ContactSalesForm
          viewerEmail={viewer?.email ?? null}
          onClose={() => setContactSalesOpen(false)}
        />
      )}

      <p className="text-[11px] text-stone-500 text-center pt-2">
        Promotion codes can be entered on the Stripe checkout page. Trials require a card; you
        won&apos;t be charged until the trial ends and you can cancel anytime from the billing portal.
      </p>
    </div>
  )
}

interface ColumnProps {
  plan: TierPlan
  interval: BillingInterval
  viewer: PricingTableViewer | null
  currentFlavor: BillingFlavor | null
  busy: boolean
  onSubscribe: () => void
  onManage: () => void
  onContactSales: () => void
}

function PricingColumn({
  plan,
  interval,
  viewer,
  currentFlavor,
  busy,
  onSubscribe,
  onManage,
  onContactSales,
}: ColumnProps) {
  const a = ACCENT[plan.accent] ?? ACCENT.stone
  const isCurrent = currentFlavor === plan.flavor
  const accountTypeMismatch =
    viewer?.accountType != null &&
    plan.accountType != null &&
    plan.accountType !== viewer.accountType

  const price = interval === 'monthly' ? plan.priceMonthly : plan.priceYearly
  const savings = yearlySavings(plan)

  let cta: { label: string; onClick?: () => void; disabled: boolean; tooltip?: string }
  if (plan.flavor === 'enterprise') {
    cta = { label: 'CONTACT SALES', onClick: onContactSales, disabled: false }
  } else if (isCurrent) {
    cta = { label: 'CURRENT PLAN', disabled: true }
  } else if (plan.flavor === 'free') {
    cta = viewer?.hasStripeCustomer
      ? { label: 'CANCEL VIA PORTAL', onClick: onManage, disabled: busy }
      : { label: 'CURRENT PLAN', disabled: true }
  } else if (accountTypeMismatch) {
    cta = {
      label: plan.accountType === 'business' ? 'BUSINESS ACCOUNT ONLY' : 'INDIVIDUAL ACCOUNT ONLY',
      disabled: true,
      tooltip:
        plan.accountType === 'business'
          ? 'Switch your account type in settings to subscribe.'
          : 'Switch your account type in settings to subscribe.',
    }
  } else if (viewer?.hasStripeCustomer && viewer.tier !== 'free') {
    cta = { label: 'SWITCH VIA PORTAL', onClick: onManage, disabled: busy }
  } else if (!viewer) {
    cta = { label: 'SIGN UP TO START', onClick: onSubscribe, disabled: false }
  } else {
    cta = {
      label: plan.trialDays > 0 ? `START ${plan.trialDays}-DAY TRIAL` : 'SUBSCRIBE',
      onClick: onSubscribe,
      disabled: busy,
    }
  }

  const showFraternityNote = plan.flavor === 'fraternity' && viewer?.accountType === 'business'

  return (
    <div className={`rounded border ring-1 ${a.bg} ${a.ring} p-5 flex flex-col`}>
      <div className="flex items-start justify-between mb-1">
        <div className={`text-lg font-bold ${a.text}`}>{plan.name}</div>
        {isCurrent && (
          <span className="text-[10px] tracking-wider px-2 py-0.5 rounded-full bg-stone-900 text-white">
            CURRENT
          </span>
        )}
      </div>
      <div className="text-xs text-stone-500 mb-4">{plan.tagline}</div>

      <div className="mb-4">
        {price == null ? (
          <div className="text-2xl font-bold text-stone-900">Custom</div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-stone-900">${price}</span>
              <span className="text-xs text-stone-500">
                /{interval === 'monthly' ? 'mo' : 'yr'}
              </span>
            </div>
            {interval === 'yearly' && savings > 0 && (
              <div className="text-[11px] text-emerald-700 mt-1">
                Save ${savings}/yr · ≈ ${Math.round(plan.priceYearly! / 12)}/mo
              </div>
            )}
          </>
        )}
      </div>

      <ul className="space-y-2 text-xs text-stone-700 mb-6 flex-1">
        {plan.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2">
            <span className="text-emerald-600 mt-0.5">✓</span>
            <span>{h}</span>
          </li>
        ))}
      </ul>

      {showFraternityNote && (
        <div className="text-[10px] text-stone-500 mb-3 leading-relaxed">
          For college fraternities only — self-declared at checkout. Misuse is refunded manually.
        </div>
      )}

      <button
        type="button"
        title={cta.tooltip}
        disabled={cta.disabled || cta.onClick == null}
        onClick={cta.onClick}
        className={`w-full py-2 text-xs tracking-wider font-semibold rounded transition disabled:opacity-50 disabled:cursor-default ${a.btn}`}
      >
        {cta.label}
      </button>

      {plan.seatLimit > 1 && Number.isFinite(plan.seatLimit) && (
        <div className="text-[10px] text-stone-400 mt-2 text-center">
          {plan.seatLimit} seats included
        </div>
      )}
    </div>
  )
}
