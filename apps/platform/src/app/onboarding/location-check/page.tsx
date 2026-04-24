import Link from 'next/link'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function LocationCheckPage() {
  const h = await headers()
  const ipState = h.get('x-vercel-ip-country-region')
  const ipCountry = h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">
          Quick location check
        </h1>
        <p className="text-sm text-white/60 mt-2">
          Many markets are state-restricted. We don&apos;t block you — we just
          tailor what we show.
        </p>
      </div>

      <div className="border border-emerald-400/30 bg-black/50 p-4 text-xs text-white/80 space-y-1 font-mono">
        <div>
          <span className="text-emerald-300/70">ip_country:</span>{' '}
          {ipCountry ?? '—'}
        </div>
        <div>
          <span className="text-emerald-300/70">ip_state:</span> {ipState ?? '—'}
        </div>
      </div>

      <div className="border border-emerald-400/20 bg-black/40 p-4 text-white/70 text-xs">
        {'>'} M1 placeholder — browser geolocation prompt + match-warning land in
        M4.
      </div>

      <div className="pt-4">
        <Link
          href="/onboarding/done"
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition"
        >
          CONTINUE
        </Link>
      </div>
    </div>
  )
}
