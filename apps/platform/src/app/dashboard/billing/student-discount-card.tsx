'use client'

import { useState } from 'react'
import type { StudentStatus } from '@/lib/student'

// Card shown beneath the pricing table on /dashboard/billing. Renders one of
// four states based on the user's current verification status, and opens a
// modal form to (re)submit.
//
// none / rejected / pending_reverification → CTA to start verification
// pending → "in review" badge + dim CTA to re-submit if needed
// approved → green "75% off applied at checkout" message

interface Props {
  status: StudentStatus
  /** Pre-populate the email field with the user's auth email — they may
   *  have signed up with their .edu address directly. */
  defaultEduEmail: string | null
}

export function StudentDiscountCard({ status, defaultEduEmail }: Props) {
  const [open, setOpen] = useState(false)
  const isApproved = status === 'approved'
  const isPending = status === 'pending'
  const needsReverify = status === 'pending_reverification'
  const isRejected = status === 'rejected'

  return (
    <>
      <section className="mt-12 rounded-lg ring-1 ring-emerald-200 bg-emerald-50 p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] text-emerald-700 tracking-wider mb-1">{'>'} STUDENT DISCOUNT</div>
          <h2 className="text-lg font-bold text-stone-900">
            {isApproved
              ? '75% off applied at checkout'
              : isPending
                ? 'Student verification in review'
                : isRejected
                  ? 'Student verification was rejected'
                  : '75% off Pro and Elite for verified students'}
          </h2>
          <p className="text-sm text-stone-700 mt-1 max-w-xl">
            {isApproved && (
              <>
                Your <strong>.edu</strong> email + Instagram + LinkedIn are verified. Subscribe to
                Pro or Elite above and the discount auto-applies on the Stripe checkout page.
              </>
            )}
            {isPending && (
              <>
                We&apos;ll review your submission within 24 hours. You&apos;ll see the 75% off
                banner here once approved.
              </>
            )}
            {isRejected && (
              <>
                Re-submit if you have a valid .edu email and updated profiles — we re-review fresh
                submissions.
              </>
            )}
            {needsReverify && (
              <>
                Your previous verification expired. Re-submit with your latest .edu email + grad
                year to keep the discount.
              </>
            )}
            {status === 'none' && (
              <>
                Submit your <strong>.edu</strong> email, Instagram handle, and LinkedIn URL.
                Admin reviews within one business day.
              </>
            )}
          </p>
        </div>
        {!isApproved && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 text-xs tracking-wider font-semibold rounded bg-emerald-700 text-white hover:bg-emerald-800"
          >
            {isPending ? 'UPDATE SUBMISSION' : 'GET STUDENT DISCOUNT'}
          </button>
        )}
      </section>

      {open && (
        <StudentSubmitModal
          defaultEduEmail={defaultEduEmail}
          onClose={() => setOpen(false)}
          onSubmitted={() => {
            setOpen(false)
            // Page refresh to pick up the new pending status. router.refresh()
            // would be cleaner but the parent is a server component and we'd
            // need to thread a client refresh up — full reload is simpler.
            window.location.reload()
          }}
        />
      )}
    </>
  )
}

interface ModalProps {
  defaultEduEmail: string | null
  onClose: () => void
  onSubmitted: () => void
}

function StudentSubmitModal({ defaultEduEmail, onClose, onSubmitted }: ModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const thisYear = new Date().getUTCFullYear()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const fd = new FormData(e.currentTarget)
    const payload = {
      edu_email: fd.get('edu_email'),
      instagram_handle: fd.get('instagram_handle'),
      linkedin_url: fd.get('linkedin_url'),
      grad_year: Number(fd.get('grad_year')),
    }
    try {
      const res = await fetch('/api/student/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({} as { message?: string; error?: string }))
      if (!res.ok) {
        setError(body.message ?? body.error ?? `Submission failed (${res.status})`)
        return
      }
      onSubmitted()
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
            <div className="text-[10px] text-emerald-700 tracking-wider mb-1">{'>'} STUDENT DISCOUNT</div>
            <h2 className="text-xl font-bold text-stone-900">Verify your student status</h2>
            <p className="text-sm text-stone-600 mt-1">
              All three are required. We don&apos;t auto-verify Instagram or LinkedIn — admin spot-checks each submission.
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label=".edu email *"
            name="edu_email"
            type="email"
            required
            placeholder="you@harvard.edu"
            defaultValue={defaultEduEmail?.endsWith('.edu') ? defaultEduEmail : ''}
          />
          <Field
            label="Instagram handle *"
            name="instagram_handle"
            required
            placeholder="@yourhandle"
          />
          <Field
            label="LinkedIn URL *"
            name="linkedin_url"
            type="url"
            required
            placeholder="https://www.linkedin.com/in/your-name"
          />
          <Field
            label="Graduation year *"
            name="grad_year"
            type="number"
            required
            placeholder={String(thisYear + 2)}
            defaultValue={String(thisYear + 2)}
          />

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
              className="px-4 py-2 text-xs tracking-wider font-semibold rounded bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {submitting ? 'SENDING…' : 'SUBMIT'}
            </button>
          </div>
        </form>
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
}

function Field({ label, name, type = 'text', required, defaultValue, placeholder }: FieldProps) {
  return (
    <label className="block">
      <span className="text-xs tracking-wider font-semibold text-stone-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 block w-full rounded border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
      />
    </label>
  )
}
