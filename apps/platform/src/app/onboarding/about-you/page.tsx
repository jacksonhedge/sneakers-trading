import Link from 'next/link'

export default function AboutYouPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">
          Tell us about you
        </h1>
        <p className="text-sm text-white/60 mt-2">
          Two quick questions so we can tailor the terminal.
        </p>
      </div>

      <div className="border border-emerald-400/20 bg-black/40 p-4 text-white/70 text-xs">
        {'>'} M1 placeholder — form lands in M2. Click continue to walk through the flow.
      </div>

      <div className="pt-4">
        <Link
          href="/onboarding/wallet"
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition"
        >
          CONTINUE
        </Link>
      </div>
    </div>
  )
}
