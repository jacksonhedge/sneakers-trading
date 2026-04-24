import Link from 'next/link'

export default function PlatformsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">
          Where do you already trade?
        </h1>
        <p className="text-sm text-white/60 mt-2">
          Check every platform you have an account on. We use this to tailor what
          we show you — and offer affiliate deals for the ones you don&apos;t.
        </p>
      </div>

      <div className="border border-emerald-400/20 bg-black/40 p-4 text-white/70 text-xs">
        {'>'} M1 placeholder — platform checklist + affiliate CTAs land in M2.
      </div>

      <div className="pt-4">
        <Link
          href="/onboarding/invite-friends"
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition"
        >
          CONTINUE
        </Link>
      </div>
    </div>
  )
}
