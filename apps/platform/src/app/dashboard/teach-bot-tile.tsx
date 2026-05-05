// "Teach your bot to trade" — replaced the old Normalized Market
// Performance chart on the dashboard's center 3-column row. Curated
// list of tweets + articles about training prediction-market AI bots.
//
// Edit the BOT_TRAINING_FEED array below to add / reorder items. Each
// entry has a kind ('tweet' | 'article'), the source/author, a title,
// a short hook, and a URL. URL `#` means "placeholder, fill me in" —
// the tile renders these as disabled-style cards with a "coming soon"
// badge so the visual structure is in place even before content is
// finalized. Once the user wants this admin-editable, the same shape
// can move to a venue_affiliate_links-style table + admin page.

import Link from 'next/link'

type FeedItemKind = 'tweet' | 'article' | 'video'

interface FeedItem {
  kind: FeedItemKind
  source: string
  /** Twitter handle, blog name, or author. Surfaced as a small chip. */
  author: string
  title: string
  hook: string
  url: string
}

const BOT_TRAINING_FEED: FeedItem[] = [
  {
    kind: 'article',
    source: 'sneakersterminal.com',
    author: 'Sneakers',
    title: 'How O’Toole reads markets — strategy, not signal',
    hook: 'Walks through the 5-gate filter, fractional Kelly sizing, and why every trade has a written rationale.',
    url: '#',
  },
  {
    kind: 'tweet',
    source: 'twitter.com',
    author: '@cryptoTrader',
    title: 'Fading Polymarket overround on settled events',
    hook: 'Thread on why the close-to-resolution premium is an actual edge, not noise — with worked numbers.',
    url: '#',
  },
  {
    kind: 'article',
    source: 'paper / blog',
    author: 'Aaronson + co.',
    title: 'Prompting an LLM to size positions like a trader',
    hook: 'Constraints + Kelly + execution rules in the system prompt — what works, what breaks.',
    url: '#',
  },
  {
    kind: 'tweet',
    source: 'twitter.com',
    author: '@kalshi_quant',
    title: 'Cross-venue arb on weather contracts',
    hook: 'When Kalshi and Polymarket disagree by >3pp on the same contract, here’s the playbook.',
    url: '#',
  },
  {
    kind: 'video',
    source: 'youtube.com',
    author: '@predictionalpha',
    title: 'Building a Polymarket bot in 30 minutes',
    hook: 'Walkthrough — fetch markets, score them, propose trades, never auto-execute without confirm.',
    url: '#',
  },
]

const KIND_META: Record<FeedItemKind, { label: string; emoji: string; cls: string }> = {
  tweet: { label: 'TWEET', emoji: '𝕏', cls: 'bg-stone-900 text-white' },
  article: { label: 'ARTICLE', emoji: '✎', cls: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200' },
  video: { label: 'VIDEO', emoji: '▶', cls: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200' },
}

export function TeachBotTile() {
  return (
    <div className="rounded border border-stone-200 bg-white h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-base">
            🤖
          </span>
          <div className="text-sm font-semibold text-stone-900">
            Teach your AI bot to trade
          </div>
        </div>
        <span className="text-[10px] text-stone-400 tracking-wider">
          {BOT_TRAINING_FEED.length} PICK{BOT_TRAINING_FEED.length === 1 ? '' : 'S'}
        </span>
      </div>

      <div className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto min-h-0">
        {BOT_TRAINING_FEED.map((item, i) => (
          <FeedRow key={`${item.title}-${i}`} item={item} />
        ))}
      </div>

      <div className="px-4 py-2.5 border-t border-stone-200 bg-stone-50 text-[11px] text-stone-600 leading-snug flex items-center justify-between gap-2">
        <span>Tweets · articles · walkthroughs to sharpen your prompt + strategy.</span>
        <Link
          href="/dashboard/settings/otoole"
          className="text-emerald-700 font-semibold hover:underline whitespace-nowrap"
        >
          STRATEGY →
        </Link>
      </div>
    </div>
  )
}

function FeedRow({ item }: { item: FeedItem }) {
  const meta = KIND_META[item.kind]
  const isPlaceholder = item.url === '#' || item.url === ''

  // External link with safe target. Placeholder rows render as a non-
  // interactive card with a soft "coming soon" badge so the visual
  // shape stays consistent until the URL is filled in.
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    isPlaceholder ? (
      <div
        className="block rounded-lg border border-stone-200 bg-white px-3 py-2 cursor-default opacity-90"
        aria-disabled="true"
      >
        {children}
      </div>
    ) : (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg border border-stone-200 bg-white hover:border-stone-400 hover:shadow-sm transition px-3 py-2"
      >
        {children}
      </a>
    )

  return (
    <Wrapper>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={`text-[9px] tracking-widest px-1.5 py-0.5 rounded font-bold ${meta.cls}`}
          aria-label={meta.label.toLowerCase()}
        >
          {meta.emoji} {meta.label}
        </span>
        <span className="text-[10px] text-stone-500 truncate">{item.author}</span>
        {isPlaceholder && (
          <span className="text-[9px] tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-bold ml-auto">
            COMING SOON
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[12px] font-bold text-stone-900 leading-tight">
        {item.title}
      </div>
      <div className="text-[11px] text-stone-600 leading-snug mt-0.5 line-clamp-2">
        {item.hook}
      </div>
    </Wrapper>
  )
}
