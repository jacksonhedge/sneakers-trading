import Image from 'next/image'
import Link from 'next/link'

// Public preview of the group captain dashboard with sample data,
// parameterized by group type so a prospect sees their version, not just
// a fraternity one. Top-level route (out of /dashboard/*) so anonymous
// visitors aren't redirected by the dashboard layout's auth gate.
//
// Type-switcher tabs live in the sticky banner; default type=friends.
// The 4 archetypes (friends / fantasy / finance / chapter) cover the
// span of "who wants to use this together" without being exhaustive.
// All copy + mock data adapts per type.

export const metadata = {
  title: 'Group dashboard preview — Sneakers Terminal',
  description:
    "What your group sees: roster, invites, leaderboards. Preview Sneakers for your friends, fantasy league, finance club, or chapter before you start.",
}

type MockStatus = 'accepted' | 'pending' | 'sent'
type GroupType = 'friends' | 'fantasy' | 'finance' | 'chapter'

interface MockMember {
  name: string
  email: string
  status: MockStatus
  joinedRel?: string
}

interface GroupPreset {
  type: GroupType
  tabLabel: string
  eyebrow: string
  groupName: string
  subline: string
  captainLabel: string
  captainName: string
  memberNounSingular: string
  rosterCountLabel: string
  inviteHeader: string
  inviteSubcopy: string
  invitePlaceholder: string
  joinLinkHeader: string
  joinLinkSubcopy: string
  members: MockMember[]
  soonCards: {
    leaderboard: { title: string; description: string }
    activityFeed: { title: string; description: string }
    chat: { title: string; description: string }
    treasury: { title: string; description: string }
  }
  ctaEyebrow: string
  ctaHeading: string
  ctaSubcopy: string
  startCtaLabel: string
}

const STATUS_PILL: Record<MockStatus, { label: string; cls: string }> = {
  accepted: { label: 'ACCEPTED', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  pending: { label: 'PENDING', cls: 'bg-amber-100 text-amber-800 ring-amber-300' },
  sent: { label: 'SENT', cls: 'bg-stone-100 text-stone-700 ring-stone-300' },
}

const FRIENDS_PRESET: GroupPreset = {
  type: 'friends',
  tabLabel: 'Friends',
  eyebrow: 'STARTER · FRIENDS',
  groupName: 'The Crew',
  subline: 'Brooklyn · started Apr 2026',
  captainLabel: 'Started by',
  captainName: 'Sam K.',
  memberNounSingular: 'friend',
  rosterCountLabel: 'FRIENDS',
  inviteHeader: 'Invite your friends',
  inviteSubcopy:
    'Paste emails (one per line) or upload a CSV / vCard. Each one gets a one-click join link.',
  invitePlaceholder: 'julia@gmail.com\nmarco@gmail.com\n...',
  joinLinkHeader: 'Your group join link',
  joinLinkSubcopy: 'Share this in your group chat. Each click drops a friend straight into your roster.',
  members: [
    { name: 'Julia M.', email: 'julia.m@gmail.com', status: 'accepted', joinedRel: '14d ago' },
    { name: 'Marco P.', email: 'marco.p@gmail.com', status: 'accepted', joinedRel: '14d ago' },
    { name: 'Tay K.', email: 'tay.k@icloud.com', status: 'accepted', joinedRel: '12d ago' },
    { name: 'Dev B.', email: 'dev.b@gmail.com', status: 'accepted', joinedRel: '11d ago' },
    { name: 'Riley S.', email: 'riley.s@gmail.com', status: 'accepted', joinedRel: '8d ago' },
    { name: 'Cam J.', email: 'cam.j@gmail.com', status: 'accepted', joinedRel: '3d ago' },
    { name: 'Maya R.', email: 'maya.r@icloud.com', status: 'pending' },
    { name: 'Noah W.', email: 'noah.w@gmail.com', status: 'pending' },
    { name: 'Quinn D.', email: 'quinn.d@gmail.com', status: 'pending' },
    { name: 'Ava L.', email: 'ava.l@icloud.com', status: 'pending' },
    { name: 'Wes T.', email: 'wes.t@gmail.com', status: 'sent' },
    { name: 'Jordan C.', email: 'jordan.c@gmail.com', status: 'sent' },
  ],
  soonCards: {
    leaderboard: {
      title: 'Group leaderboard',
      description:
        'Rank everyone by rate of return. Friendly competition, weekly resets, end-of-month champion.',
    },
    activityFeed: {
      title: 'Activity feed',
      description:
        "See what your friends are trading in real time. O'Toole proposals they confirm, fills, P&L moves. Privacy-aware — opt-out per person.",
    },
    chat: {
      title: 'Group chat',
      description:
        "Per-group chat thread. Call O'Toole in-thread to settle a debate or run a quick analysis on a market.",
    },
    treasury: {
      title: 'Group pool',
      description:
        'Optional shared pool. Anyone can seed it, the group contributes, P&L splits on a rule the group sets. KYC required — opt-in.',
    },
  },
  ctaEyebrow: 'READY TO DO THIS FOR REAL?',
  ctaHeading: 'Start your group.',
  ctaSubcopy:
    'Free while we ship members + invite tools. You become the group starter; everyone you invite onboards through your link.',
  startCtaLabel: 'START YOUR GROUP →',
}

const FANTASY_PRESET: GroupPreset = {
  type: 'fantasy',
  tabLabel: 'Fantasy League',
  eyebrow: 'COMMISSIONER · FANTASY LEAGUE',
  groupName: 'Sunday Squad',
  subline: '12-team PPR · 6th season',
  captainLabel: 'Commissioner',
  captainName: 'Mike Lozano',
  memberNounSingular: 'manager',
  rosterCountLabel: 'MANAGERS',
  inviteHeader: 'Invite your league',
  inviteSubcopy:
    'Paste emails or upload your league export. Each manager gets a one-click join link.',
  invitePlaceholder: 'dave@gmail.com\nkevin@yahoo.com\n...',
  joinLinkHeader: 'Your league join link',
  joinLinkSubcopy: 'Drop this in your league group chat. Each manager joins with one click.',
  members: [
    { name: 'Dave Park', email: 'dave.park@gmail.com', status: 'accepted', joinedRel: '9d ago' },
    { name: 'Kevin Hwang', email: 'khwang@yahoo.com', status: 'accepted', joinedRel: '9d ago' },
    { name: 'Pat Sullivan', email: 'pat.sully@gmail.com', status: 'accepted', joinedRel: '8d ago' },
    { name: 'Steve Reilly', email: 'sreilly@gmail.com', status: 'accepted', joinedRel: '7d ago' },
    { name: 'Marco DeLuca', email: 'marco.deluca@gmail.com', status: 'accepted', joinedRel: '4d ago' },
    { name: 'Frankie Russo', email: 'frankie.r@yahoo.com', status: 'accepted', joinedRel: '2d ago' },
    { name: 'Charlie Yang', email: 'charlie.yang@gmail.com', status: 'pending' },
    { name: 'Tony Ricci', email: 'tony.ricci@gmail.com', status: 'pending' },
    { name: 'Greg Bauer', email: 'greg.bauer@yahoo.com', status: 'pending' },
    { name: 'Doug O’Shea', email: 'doug.oshea@gmail.com', status: 'pending' },
    { name: 'Hunter Cole', email: 'hunter.cole@gmail.com', status: 'sent' },
    { name: 'Big Joe', email: 'big.joe.h@yahoo.com', status: 'sent' },
  ],
  soonCards: {
    leaderboard: {
      title: 'League leaderboard',
      description:
        'Rank managers by rate of return alongside your fantasy standings. Side-bet bragging rights, weekly.',
    },
    activityFeed: {
      title: 'Activity feed',
      description:
        "What your league is trading on game day. Player props, futures, live in-game. O'Toole flags moves worth chasing.",
    },
    chat: {
      title: 'League chat',
      description:
        "Per-league thread. Pull O'Toole into a debate about a player prop without leaving the conversation.",
    },
    treasury: {
      title: 'League pot',
      description:
        'Optional shared pot for season-long side bets. Commissioner seeds, league contributes, payouts on resolution. KYC required.',
    },
  },
  ctaEyebrow: 'READY TO RUN THIS FOR YOUR LEAGUE?',
  ctaHeading: 'Start your league.',
  ctaSubcopy:
    'Free while we ship roster + invite tools. You become commissioner; your league joins through your link.',
  startCtaLabel: 'START YOUR LEAGUE →',
}

const FINANCE_PRESET: GroupPreset = {
  type: 'finance',
  tabLabel: 'Finance Club',
  eyebrow: 'CHAIR · FINANCE CLUB',
  groupName: 'Wharton Markets Society',
  subline: 'Wharton · Markets practice group',
  captainLabel: 'Chair',
  captainName: 'Aiden Kim',
  memberNounSingular: 'analyst',
  rosterCountLabel: 'ANALYSTS',
  inviteHeader: 'Invite the analysts',
  inviteSubcopy:
    'Paste school emails or upload your roster CSV. Each analyst gets a one-click join link.',
  invitePlaceholder: 'maya.patel@wharton.upenn.edu\ndaniel.chen@wharton.upenn.edu\n...',
  joinLinkHeader: 'Your club join link',
  joinLinkSubcopy:
    'Share in your club channel or members list. Each click joins the analyst to the club roster.',
  members: [
    { name: 'Maya Patel', email: 'maya.patel@wharton.upenn.edu', status: 'accepted', joinedRel: '21d ago' },
    { name: 'Daniel Chen', email: 'daniel.chen@wharton.upenn.edu', status: 'accepted', joinedRel: '21d ago' },
    { name: 'Sofia Reyes', email: 'sofia.reyes@wharton.upenn.edu', status: 'accepted', joinedRel: '18d ago' },
    { name: 'Ethan Wong', email: 'ethan.wong@wharton.upenn.edu', status: 'accepted', joinedRel: '15d ago' },
    { name: 'Noah Lieberman', email: 'noah.lieberman@wharton.upenn.edu', status: 'accepted', joinedRel: '10d ago' },
    { name: 'Lila Schwartz', email: 'lila.schwartz@wharton.upenn.edu', status: 'accepted', joinedRel: '4d ago' },
    { name: 'Jasper Singh', email: 'jasper.singh@wharton.upenn.edu', status: 'pending' },
    { name: 'Camille Park', email: 'camille.park@wharton.upenn.edu', status: 'pending' },
    { name: 'Mason Lee', email: 'mason.lee@wharton.upenn.edu', status: 'pending' },
    { name: 'Priya Iyer', email: 'priya.iyer@wharton.upenn.edu', status: 'pending' },
    { name: 'Owen Lin', email: 'owen.lin@wharton.upenn.edu', status: 'sent' },
    { name: 'Henry Cole', email: 'henry.cole@wharton.upenn.edu', status: 'sent' },
  ],
  soonCards: {
    leaderboard: {
      title: 'Club leaderboard',
      description:
        'Rank analysts by rate of return. Pitch-night standings, semester champion, alumni leaderboard across years.',
    },
    activityFeed: {
      title: 'Activity feed',
      description:
        "What the club is trading and watching. O'Toole-proposed trades the analysts ran, calibration of pitch-night picks vs market.",
    },
    chat: {
      title: 'Club channel',
      description:
        "Per-club thread. Call O'Toole to argue with an analyst's pitch or run a structured analysis in front of the room.",
    },
    treasury: {
      title: 'Club fund',
      description:
        'Optional shared fund. Chair seeds it from the club budget, contributions tracked, P&L allocated on rules the club sets. KYC required.',
    },
  },
  ctaEyebrow: 'READY TO RUN THIS FOR YOUR CLUB?',
  ctaHeading: 'Start your club.',
  ctaSubcopy:
    'Free while we ship roster + invite tools. You become chair; the club roster joins through your link.',
  startCtaLabel: 'START YOUR CLUB →',
}

const CHAPTER_PRESET: GroupPreset = {
  type: 'chapter',
  tabLabel: 'Greek Chapter',
  eyebrow: 'CAPTAIN · GREEK CHAPTER',
  groupName: 'Beta Theta Pi',
  subline: 'Fraternity · Yale University',
  captainLabel: 'Captain',
  captainName: 'Jackson F.',
  memberNounSingular: 'brother',
  rosterCountLabel: 'BROTHERS',
  inviteHeader: 'Invite your brothers',
  inviteSubcopy:
    'Paste emails (one per line) or upload a CSV / vCard. Each one gets a one-click join link.',
  invitePlaceholder: 'tucker@yale.edu\nbrody@yale.edu\n...',
  joinLinkHeader: 'Your chapter join link',
  joinLinkSubcopy: 'Share this in your group chat. Each click drops a brother straight into your roster.',
  members: [
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
  ],
  soonCards: {
    leaderboard: {
      title: 'House leaderboard',
      description:
        'Rank brothers by rate of return. Friendly fire across your roster, weekly resets, end-of-semester champion.',
    },
    activityFeed: {
      title: 'Activity feed',
      description:
        "See what your brothers are trading in real time. O'Toole proposals they confirm, fills, P&L moves. Privacy-aware — opt-out per brother.",
    },
    chat: {
      title: 'House chat',
      description:
        "Per-chapter chat thread. Call O'Toole in-thread to settle a debate or run a quick analysis on a market.",
    },
    treasury: {
      title: 'House treasury',
      description:
        'Optional shared pool. Captain seeds it, brothers contribute, P&L splits on a defined rule. KYC required — opt-in per chapter.',
    },
  },
  ctaEyebrow: 'READY TO DO THIS FOR YOUR HOUSE?',
  ctaHeading: 'Start your chapter.',
  ctaSubcopy:
    '$799/mo, up to 25 seats, every active brother gets a login. Captains sign up as the leader; members onboard via your link as we ship the roster + invite tools.',
  startCtaLabel: 'START YOUR CHAPTER →',
}

const PRESETS: Record<GroupType, GroupPreset> = {
  friends: FRIENDS_PRESET,
  fantasy: FANTASY_PRESET,
  finance: FINANCE_PRESET,
  chapter: CHAPTER_PRESET,
}

const TAB_ORDER: GroupType[] = ['friends', 'fantasy', 'finance', 'chapter']

const TABS: Array<{ label: string; active?: boolean; pending?: boolean }> = [
  { label: 'Members', active: true },
  { label: 'Seats', pending: true },
  { label: 'Treasury' },
  { label: 'Bot', pending: true },
  { label: 'Settings', pending: true },
]

function isGroupType(v: string | undefined): v is GroupType {
  return v === 'friends' || v === 'fantasy' || v === 'finance' || v === 'chapter'
}

export default async function GroupPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const sp = await searchParams
  const type: GroupType = isGroupType(sp.type) ? sp.type : 'friends'
  const preset = PRESETS[type]

  const acceptedCount = preset.members.filter((m) => m.status === 'accepted').length
  const pendingCount = preset.members.filter((m) => m.status === 'pending').length
  const sentCount = preset.members.filter((m) => m.status === 'sent').length

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      {/* Sticky preview banner + type tabs */}
      <div className="sticky top-0 z-30 bg-emerald-500 text-black border-b border-emerald-600/40">
        <div className="max-w-5xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs font-semibold flex items-center gap-2">
            <span aria-hidden>👀</span>
            <span>
              You&apos;re previewing how Sneakers works for your group, with sample data.
            </span>
          </div>
          <Link
            href="/"
            className="text-[11px] font-bold tracking-wider bg-stone-950 text-emerald-300 px-3 py-1.5 rounded-full hover:bg-stone-900 transition whitespace-nowrap"
          >
            {preset.startCtaLabel}
          </Link>
        </div>
        <div className="border-t border-emerald-600/30">
          <div className="max-w-5xl mx-auto px-6 py-1.5 flex items-center gap-1 overflow-x-auto">
            <div className="text-[10px] tracking-[0.15em] font-bold text-stone-900/70 pr-2 whitespace-nowrap">
              YOUR GROUP IS A …
            </div>
            {TAB_ORDER.map((t) => {
              const isActive = t === type
              return (
                <Link
                  key={t}
                  href={`/group-preview?type=${t}`}
                  prefetch={false}
                  className={`text-[11px] font-bold tracking-wider px-3 py-1 rounded-full transition whitespace-nowrap ${
                    isActive
                      ? 'bg-stone-950 text-emerald-300'
                      : 'bg-emerald-400/20 text-stone-900 hover:bg-emerald-400/40'
                  }`}
                >
                  {PRESETS[t].tabLabel.toUpperCase()}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link
          href="/"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← BACK TO LANDING
        </Link>

        {/* Group header */}
        <div className="mt-6 mb-6 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="text-xs text-emerald-700 tracking-wider font-semibold mb-2">
              {preset.eyebrow}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{preset.groupName}</h1>
            <div className="mt-1 text-sm text-stone-600">{preset.subline}</div>
            <div className="mt-2 text-xs text-stone-500">
              {preset.captainLabel}: <span className="text-stone-800">{preset.captainName}</span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 text-[10px] font-bold tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              ACTIVE
            </span>
            <div className="mt-2 text-[11px] text-stone-500 tracking-wider">
              {acceptedCount} accepted · {pendingCount} pending · {sentCount} sent
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
          {/* Invite box */}
          <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-5">
            <div className="text-sm font-semibold text-stone-900 mb-1">
              {preset.inviteHeader}
            </div>
            <div className="text-xs text-stone-500 mb-3">{preset.inviteSubcopy}</div>
            <textarea
              disabled
              rows={3}
              placeholder={preset.invitePlaceholder}
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
                Disabled in preview · live once you start your group
              </div>
            </div>
          </div>

          {/* Share-link card */}
          <div className="rounded-2xl bg-white ring-1 ring-stone-200 p-5">
            <div className="text-sm font-semibold text-stone-900 mb-1">
              {preset.joinLinkHeader}
            </div>
            <div className="text-xs text-stone-500 mb-3">{preset.joinLinkSubcopy}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-0 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-700 font-mono truncate">
                sneakersterminal.com/join/<span className="text-stone-400">your-group-id</span>
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
                {preset.members.length} {preset.rosterCountLabel}
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
                {preset.members.map((m) => {
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

          {/* SOON cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['leaderboard', 'activityFeed', 'chat', 'treasury'] as const).map((k) => (
              <div
                key={k}
                className="rounded-2xl bg-white ring-1 ring-stone-200 p-5"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold text-stone-900">
                    {preset.soonCards[k].title}
                  </div>
                  <span className="text-[9px] tracking-[0.15em] font-bold text-stone-400">
                    SOON
                  </span>
                </div>
                <div className="text-xs text-stone-500 leading-relaxed">
                  {preset.soonCards[k].description}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom conversion CTA */}
        <div className="mt-12 rounded-2xl bg-stone-950 text-white p-8 text-center">
          <div className="text-xs tracking-[0.2em] text-emerald-300/80 font-semibold mb-2">
            {preset.ctaEyebrow}
          </div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
            {preset.ctaHeading}
          </h2>
          <p className="mt-3 text-sm text-white/70 max-w-lg mx-auto leading-relaxed">
            {preset.ctaSubcopy}
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-full bg-emerald-500 text-black font-bold px-8 py-3 tracking-wider hover:bg-emerald-400 transition"
          >
            {preset.startCtaLabel}
          </Link>
          <div className="mt-3 text-[11px] text-white/40">
            {preset.type === 'chapter'
              ? '14-day free trial · first 10 accepted orgs get bonus early access'
              : 'Early access · we ship the rest as we go'}
          </div>
        </div>
      </div>
    </main>
  )
}
