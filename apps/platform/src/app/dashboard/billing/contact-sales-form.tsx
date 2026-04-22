'use client'

import { useState } from 'react'

// Inline modal for Enterprise Contact-Sales submissions. Posts to
// /api/enterprise/inquiry which writes to the enterprise_inquiries table —
// not a Stripe flow.

interface Props {
  viewerEmail: string | null
  onClose: () => void
}

export function ContactSalesForm({ viewerEmail, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const fd = new FormData(e.currentTarget)
    const hardwareInterest = fd.get('hardware_interest') === 'on'
    const payload = {
      contact_name: fd.get('contact_name'),
      contact_email: fd.get('contact_email'),
      company_name: fd.get('company_name'),
      phone: fd.get('phone'),
      use_case: fd.get('use_case'),
      volume_estimate: fd.get('volume_estimate'),
      referral_source: fd.get('referral_source'),
      hardware_interest: hardwareInterest,
      hardware_form_factor: hardwareInterest ? fd.get('hardware_form_factor') : null,
    }
    try {
      const res = await fetch('/api/enterprise/inquiry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        setError(body.error ?? `Submission failed (${res.status})`)
        return
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg w-full bg-white rounded-lg shadow-xl ring-1 ring-stone-200 p-6"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] text-[#004225] tracking-wider mb-1">{'>'} ENTERPRISE</div>
            <h2 className="text-xl font-bold text-stone-900">Contact Sales</h2>
            <p className="text-sm text-stone-600 mt-1">
              Custom deployments, SSO, white-label, dedicated infra. Optional hardware bundle
              (Mac Studio or MacBook Pro) is <strong>included in the recurring fee</strong> — not a
              free giveaway. We&apos;ll be in touch within one business day.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="text-3xl mb-3">✓</div>
            <div className="text-lg font-semibold text-stone-900 mb-1">Thanks — we got it.</div>
            <p className="text-sm text-stone-600">
              You&apos;ll hear from us at the email you provided within one business day.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 px-4 py-2 text-xs tracking-wider font-semibold rounded bg-stone-900 text-white hover:bg-stone-800"
            >
              CLOSE
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Your name *" name="contact_name" required />
            <Field
              label="Email *"
              name="contact_email"
              type="email"
              required
              defaultValue={viewerEmail ?? ''}
            />
            <Field label="Company" name="company_name" />
            <Field label="Phone" name="phone" type="tel" />
            <Field
              label="What are you trying to do?"
              name="use_case"
              textarea
              rows={3}
              placeholder="e.g. desk of 8 traders, ~50K market polls/day, want SSO"
            />
            <Field
              label="Rough volume estimate"
              name="volume_estimate"
              placeholder="e.g. 100 markets/sec, team of 5"
            />
            <Field label="How did you hear about us?" name="referral_source" />

            <HardwareSection />

            {error && (
              <div className="rounded border border-red-300 bg-red-50 text-red-800 px-3 py-2 text-xs">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs tracking-wider font-semibold rounded text-stone-600 hover:text-stone-900"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs tracking-wider font-semibold rounded bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
              >
                {submitting ? 'SENDING…' : 'SEND INQUIRY'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  textarea?: boolean
  rows?: number
}

function HardwareSection() {
  const [interested, setInterested] = useState(false)
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-3 space-y-3">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          name="hardware_interest"
          checked={interested}
          onChange={(e) => setInterested(e.target.checked)}
          className="mt-1"
        />
        <span className="text-xs text-stone-700">
          <strong>Include a Mac terminal in the contract.</strong> The hardware cost is rolled into
          your recurring fee — it&apos;s not a freebie. We size + ship the machine after the deal
          closes.
        </span>
      </label>
      {interested && (
        <label className="block">
          <span className="text-xs tracking-wider font-semibold text-stone-700">Form factor</span>
          <select
            name="hardware_form_factor"
            defaultValue="unspecified"
            className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 text-sm text-stone-900"
          >
            <option value="unspecified">Not sure yet — let&apos;s discuss</option>
            <option value="mac_studio">Mac Studio (desk install, dual monitor)</option>
            <option value="macbook_pro">MacBook Pro (mobile / hybrid)</option>
          </select>
        </label>
      )}
    </div>
  )
}

function Field({ label, name, type = 'text', required, defaultValue, placeholder, textarea, rows = 3 }: FieldProps) {
  const cls =
    'mt-1 block w-full rounded border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500'
  return (
    <label className="block">
      <span className="text-xs tracking-wider font-semibold text-stone-700">{label}</span>
      {textarea ? (
        <textarea
          name={name}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={rows}
          className={cls}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </label>
  )
}
