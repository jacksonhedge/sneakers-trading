import Link from 'next/link'

export default function InviteFriendsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">
          Bring your inner circle
        </h1>
        <p className="text-sm text-white/60 mt-2">
          Add up to 5 emails and we&apos;ll send them a pre-signed invite that
          skips the queue.
        </p>
      </div>

      <div className="border border-emerald-400/20 bg-black/40 p-4 text-white/70 text-xs">
        {'>'} M1 placeholder — email-invite form lands in M3.
      </div>

      <div className="pt-4">
        <Link
          href="/onboarding/location-check"
          className="inline-block border border-emerald-400 bg-emerald-500 text-black font-semibold px-6 py-3 hover:bg-emerald-400 hover:border-emerald-300 transition"
        >
          CONTINUE
        </Link>
      </div>
    </div>
  )
}
