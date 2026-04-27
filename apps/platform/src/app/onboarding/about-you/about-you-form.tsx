'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const US_STATES: Array<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'D.C.' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]

const USE_CASES: Array<{ id: 'hobbyist' | 'semi_pro' | 'arb_hunter' | 'analyst'; label: string; sub: string }> = [
  { id: 'hobbyist', label: 'Hobbyist', sub: 'I bet for fun. Want to look smart at the bar.' },
  { id: 'semi_pro', label: 'Semi-pro', sub: '$500–$5K/mo across 2–4 books. Looking for an edge.' },
  { id: 'arb_hunter', label: 'Arb hunter', sub: 'I scan books for spread differences. Need cross-book data fast.' },
  { id: 'analyst', label: 'Analyst', sub: 'Researching markets / writing about them. Want the deepest data.' },
]

export function AboutYouForm({
  initialState,
  initialUseCase,
}: {
  initialState: string | null
  initialUseCase: string | null
}) {
  const router = useRouter()
  const [state, setState] = useState(initialState ?? '')
  const [useCase, setUseCase] = useState<typeof USE_CASES[number]['id'] | ''>(
    (initialUseCase as typeof USE_CASES[number]['id']) ?? '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!state || !useCase) {
      setError('Pick your state and tell us how you trade.')
      return
    }
    setBusy(true)
    setError(null)
    const res = await fetch('/api/onboarding/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state,
        use_case: useCase,
        current_step: 'about-you',
      }),
    })
    if (!res.ok) {
      setBusy(false)
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setError(body.message ?? 'Something went wrong. Try again.')
      return
    }
    router.push('/onboarding/wallet')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <label className="block text-[11px] tracking-wider text-emerald-300/80 mb-2">
          STATE
        </label>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          required
          className="w-full bg-black/40 border border-white/30 text-white px-4 py-3 rounded focus:outline-none focus:border-emerald-400 transition"
        >
          <option value="" disabled>
            Select your state…
          </option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code} className="bg-stone-950">
              {s.name}
            </option>
          ))}
        </select>
        <div className="text-[10px] text-white/45 mt-1.5">
          Many markets are state-restricted. We tailor what we show — never block.
        </div>
      </div>

      <div>
        <div className="block text-[11px] tracking-wider text-emerald-300/80 mb-2">
          HOW DO YOU TRADE?
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {USE_CASES.map((opt) => {
            const active = useCase === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setUseCase(opt.id)}
                className={`text-left p-3 rounded border transition ${
                  active
                    ? 'border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/40'
                    : 'border-white/20 bg-black/40 hover:border-white/40 hover:bg-black/60'
                }`}
              >
                <div
                  className={`text-sm font-semibold ${active ? 'text-emerald-300' : 'text-white'}`}
                >
                  {opt.label}
                </div>
                <div className="text-[11px] text-white/55 mt-0.5 leading-snug">
                  {opt.sub}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={busy || !state || !useCase}
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition disabled:opacity-50 tracking-wider"
        >
          {busy ? 'SAVING…' : 'CONTINUE →'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-950/40 border border-red-400/40 rounded px-3 py-2">
          {'>'} {error}
        </div>
      )}
    </form>
  )
}
