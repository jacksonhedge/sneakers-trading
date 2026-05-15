import Image from 'next/image'
import Link from 'next/link'

// Public preview of the captain dashboard with sample data. The real
// dashboard at /dashboard/org is gated behind an active org signup
// ($799/mo), which means prospects bounce because they can't see what
// they're buying. This page mirrors the real captain UI with realistic
// mock data so a chapter leader can decide before paying.
//
// Top-level route on purpose — kept out of /dashboard/* so the layout
// auth-gate doesn't redirect anonymous visitors.

export const metadata = {
  title: 'Chapter dashboard preview — Sneakers Terminal',
  description:
    "What your house sees: roster, invites, treasury, leaderboards. Preview the chapter captain dashboard before you sign up.",
}

type MockStatus = 'accepted' | 'pending' | 'sent'

interface MockMember {
  name: string
  email: string
  status: MockStatus
  joinedRel?: string
}

const MOCK_MEMBERS: MockMember[] = [
  { name: 'Tucker H.', email: 'tucker.h@yale.edu', status: 'accepted', joinedRel: '12d ago' },
  { name: 'Brody C.', email: 'brody.c@yale.edu', status: 'accepted', joinedRel: '12d ago' },
  { name: 'Beckett N.', email: 'beckett.n@yale.edu', status: 'accepted', joinedRel: '11d ago' },
  { name: 'Chase L.', email: 'chase.l@yale.edu', status: 'accepted', joinedRel: '9d ago' },
  { name: 'Wyatt P.', email: 'wyatt.p@yale.edu', status: 'accepted', joinedRel: '6d ago' },
  { name: 'Garrison T.', email: 'garrison.t@yale.edu', status: 'accepted', joinedRel: '3d ago' },
  { name: 'Hudson M.', email: 'hudson.m@yale.edu', status: 'pending' },
  { name: 'Sullivan B.', email: 'sully.b@yale.edu', status: 'pending' },
  { name: 'Decker O.', email: 'decker.o@yale.edu', status: 'pending' },
  { name: 'Knox R.', email: 'knox.r@yale.edu', status: 'pending' },
  { name: 'Tate S.', email: 'tate.s@yale.edu', status: 'sent' },
  { name: 'Rhett W.', email: 'rhett.w@yale.edu', status: 'sent' },
]

const STATUS_PILL: Record<MockStatus, { label: string; cls: string }> = {
  accepted: { label: 'ACCEPTED', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  pending: { label: 'PENDING', cls: 'bg-amber-100 text-amber-800 ring-amber-300' },
  sent: { label: 'SENT', cls: 'bg-stone-100 text-stone-700 ring-stone-300' },
}

const TABS: Array<{ label: string; active?: boolean; pending?: boolean }> = [
  { label: 'Members', active: true },
  { label: 'Seats', pending: true },
  { label: 'Treasury' },
  { label: 'Bot', pending: true },
  { label: 'Settings', pending: true },
]

export default function ChapterPreviewPage() {
  const acceptedCount = MOCK_MEMBERS.filter((m) => m.status === 'accepted').length
  const pendingCount = MOCK_MEMBERS.filter(
    (m) => m.status === 'pending' || m.status === 'sent',
  ).length

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      {/* Sticky preview banner */}
      <div className="sticky top-0 z-30 bg-emerald-500 text-black border-b border-emerald-600/40">
        <div className="max-w-5xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs font-semibold flex items-center gap-2">
            <span aria-hidden>👀</span>
            <span>
              You&apos;re previewing the captain dashboard with sample data.
            </span>
          </div>
          <Link
            href="/"
            className="text-[11px] font-bold tracking-wider bg-stone-950 text-emerald-300 px-3 py-1.5 rounded-full hover:bg-stone-900 transition whitespace-nowrap"
          >
            START YOUR CHAPTER →
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href="/"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← BACK TO LANDING
        </Link>

        {/* Org header — mirrors real /dashboard/org chrome */}
        <div className="mt-6 mb-6 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs text-emerald-700 tracking-wider font-semibold mb-2">
              CAPTAIN · ORGANIZATION
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Beta Theta Pi</h1>
            <div className="mt-1 text-sm text-stone-600">
              <span className="capitalize">Fraternity</span>
              <span className="mx-2 text-stone-300">·</span>
              Yale University
            </div>
            <div className="mt-2 text-xs text-stone-500">
              Captain: <span className="text-stone-800">Jackson F.</span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 text-[10px] font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              ACTIVE
            </span>
            <div className="mt-2 text-[11px] text-stone-500 tracking-wider">
              {acceptedCount} accepted · {pendingCount} pending
            </div>
          </div>
        </div>

        {/* Tab nav — static, no switching in preview */}
        <div className="border-b border-stone-200 mb-6">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <div
                key={t.label}
                aria-current={t.active ? 'page' : undefined}
                className={`px-4 py-2.5 text-sm font-semibold tracking-wider border-b-2 -mb-[2px] ${
                  t.active
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-stone-400'
                }`}
              >
                {t.label}
                {t.pending && (
                  <span className="ml-2 text-[9px] tracking-[0.15em] font-bold text-stone-400">
                    SOON
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Members tab content */}
        <section className="space-y-6">
          {/* Invite box — visually intact, inputs disabled with hint */}
          <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-5">
            <div className="text-sm font-semibold text-stone-900 mb-1">
              Invite your brothers
            </div>
            <div className="text-xs text-stone-500 mb-3">
              Paste emails (one per line) or upload a CSV / vCard. Each one gets a
              one-click join link.
            </div>
            <textarea
              disabled
              rows={3}
              placeholder="tucker@yale.edu&#10;brody@yale.edu&#10;..."
              className="w-full bg-stone-50 border border-stone-200 text-stone-400 px-3 py-2 rounded-lg text-sm cursor-not-allowed"
            />
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  className="rounded-full bg-stone-200 text-stone-500 font-semibold px-4 py-2 text-xs tracking-wider cursor-not-allowed"
                >
                  SEND INVITES
                </button>
                <button
                  type="button"
                  disabled
                  className="rounded-full bg-white text-stone-500 ring-1 ring-stone-300 font-semibold px-4 py-2 text-xs tracking-wider cursor-not-allowed"
                >
                  UPLOAD CSV
                </button>
              </div>
              <div className="text-[11px] text-stone-500 italic">
                Disabled in preview · live once you start your chapter
              </div>
            </div>
          </div>

          {/* Share-link card */}
          <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-5">
            <div className="text-sm font-semibold text-stone-900 mb-1">
              Your chapter join link
            </div>
            <div className="text-xs text-stone-500 mb-3">
              Share this in your group chat. Each click drops a brother straight
              into your roster.
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-0 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 font-mono truncate">
                sneakersterminal.com/join/<span className="text-stone-400">your-chapter-id</span>
              </code>
              <button
                type="button"
                disabled
                className="rounded-full bg-stone-200 text-stone-500 font-semibold px-4 py-2 text-xs tracking-wider cursor-not-allowed"
              >
                COPY
              </button>
            </div>
          </div>

          {/* Roster table */}
          <div className="rounded-2xl bg-white ring-1 ring-stone-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-stone-900">Roster</div>
              <div className="text-[11px] text-stone-500 tracking-wider">
                {MOCK_MEMBERS.length} BROTHERS
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] tracking-wider text-stone-500 border-b border-stone-100">
                  <th className="text-left px-5 py-2 font-semibold">NAME</th>
                  <th className="text-left px-5 py-2 font-semibold">EMAIL</th>
                  <th className="text-left px-5 py-2 font-semibold">STATUS</th>
                  <th className="text-right px-5 py-2 font-semibold">JOINED</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_MEMBERS.map((m) => {
                  const pill = STATUS_PILL[m.status]
                  return (
                    <tr
                      key={m.email}
                      className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50/60 transition"
                    >
                      <td className="px-5 py-2.5 text-stone-900 font-medium">{m.name}</td>
                      <td className="px-5 py-2.5 text-stone-600 font-mono text-xs">
                        {m.email}
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ring-1 ${pill.cls}`}
                        >
                          {pill.label}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right text-[11px] text-stone-500 tabular-nums">
                        {m.joinedRel ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Future-state cards — show what's coming, not vaporware */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold text-stone-900">House leaderboard</div>
                <span className="text-[9px] tracking-[0.15em] font-bold text-stone-400">SOON</span>
              </div>
              <div className="text-xs text-stone-500 leading-relaxed">
                Rank brothers by rate of return. Friendly fire across your roster,
                weekly resets, end-of-semester champion.
              </div>
            </div>
            <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold text-stone-900">Activity feed</div>
                <span className="text-[9px] tracking-[0.15em] font-bold text-stone-400">SOON</span>
              </div>
              <div className="text-xs text-stone-500 leading-relaxed">
                See what your brothers are trading in real time. O&apos;Toole proposals
                they confirm, fills, P&amp;L moves. Privacy-aware — opt-out per
                brother.
              </div>
            </div>
            <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold text-stone-900">House chat</div>
                <span className="text-[9px] tracking-[0.15em] font-bold text-stone-400">SOON</span>
              </div>
              <div className="text-xs text-stone-500 leading-relaxed">
                Per-chapter chat thread. Call O&apos;Toole in-thread to settle a
                debate or run a quick analysis on a market.
              </div>
            </div>
            <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold text-stone-900">House treasury</div>
                <span className="text-[9px] tracking-[0.15em] font-bold text-stone-400">SOON</span>
              </div>
              <div className="text-xs text-stone-500 leading-relaxed">
                Optional shared pool. Captain seeds it, brothers contribute, P&amp;L
                splits on a defined rule. KYC required — opt-in per chapter.
              </div>
            </div>
          </div>
        </section>

        {/* Bottom conversion CTA */}
        <div className="mt-12 rounded-2xl bg-stone-950 text-white p-8 text-center">
          <div className="text-xs tracking-[0.2em] text-emerald-300/80 font-semibold mb-2">
            READY TO DO THIS FOR REAL?
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            Start your chapter.
          </h2>
          <p className="mt-3 text-sm text-white/70 max-w-lg mx-auto leading-relaxed">
            $799/mo, up to 25 seats, every active brother gets a login. Captains
            sign up as the leader; members onboard via your link as we ship the
            roster + invite tools.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full bg-emerald-500 text-black font-bold px-8 py-3 tracking-wider hover:bg-emerald-400 transition"
          >
            START YOUR CHAPTER →
          </Link>
          <div className="mt-3 text-[11px] text-white/40">
            14-day free trial · first 10 accepted orgs get bonus early access
          </div>
        </div>
      </div>
    </main>
  )
}
