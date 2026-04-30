import Link from 'next/link'
import { BroadcastComposer } from './composer'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Announcements — Admin — Sneakers Terminal',
}

export default async function AnnouncementsPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} ANNOUNCEMENTS</div>
        <h1 className="text-2xl font-bold text-stone-900">Broadcast email</h1>
        <p className="text-sm text-stone-600 mt-1 max-w-2xl">
          Send a one-off plain-text email to a group of users. Two-step send: preview shows the
          recipient count + a sample of who&apos;s in the set, then a separate confirm-send fires
          the emails sequentially via Resend.
        </p>
        <p className="text-sm text-stone-500 mt-1 max-w-2xl">
          Hard cap: 500 recipients per send. Every broadcast (and every per-recipient failure) is
          logged in the{' '}
          <Link href="/audit" className="text-[#00703c] underline">audit log</Link>.
        </p>
      </div>

      <BroadcastComposer />
    </div>
  )
}
