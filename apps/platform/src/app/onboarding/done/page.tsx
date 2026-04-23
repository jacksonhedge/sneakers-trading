import Link from 'next/link'

export default function DonePage() {
  return (
    <div className="space-y-6 text-center">
      <div>
        <div className="text-4xl font-bold text-emerald-400 mb-2">Ready.</div>
        <h1 className="text-xl text-white/90">Your terminal is live.</h1>
        <p className="text-sm text-white/60 mt-2">
          Setup is complete. Your dashboard is configured with what you told us.
        </p>
      </div>

      <div className="border border-emerald-400/20 bg-black/40 p-4 text-white/70 text-xs">
        {'>'} M1 placeholder — profile_complete_at flip + dashboard redirect land
        in M5.
      </div>

      <div className="pt-4">
        <Link
          href="/dashboard"
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-8 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition"
        >
          OPEN DASHBOARD
        </Link>
      </div>
    </div>
  )
}
