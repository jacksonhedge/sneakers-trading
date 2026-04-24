import Image from 'next/image'
import Link from 'next/link'
import { ProfileAvatar } from '@/components/profile-avatar'

type NavItem = { label: string; icon: string; href?: string; active?: boolean; soon?: boolean }

const MAIN: NavItem[] = [
  { label: 'Dashboard', icon: '▦', href: '/dashboard', active: true },
  { label: 'Signals', icon: '⚡', soon: true },
  { label: 'Markets', icon: '▣', href: '/markets' },
  { label: 'Portfolio', icon: '■', soon: true },
  { label: 'Calendar', icon: '▤', soon: true },
  { label: 'Heatmap', icon: '◉', soon: true },
]

const TRADING: NavItem[] = [
  { label: 'Scanner', icon: '◎', soon: true },
  { label: 'Order Book', icon: '▥', soon: true },
  { label: 'Positions', icon: '◈', soon: true },
  { label: 'History', icon: '◷', soon: true },
  { label: 'Simulator', icon: '◩', soon: true },
]

const OTOOLE: NavItem[] = [
  { label: 'Chat', icon: '💬', soon: true },
  { label: 'Insights', icon: '◐', soon: true },
  { label: 'Auto-Trade', icon: '⚡', soon: true },
]

const ACCOUNT: NavItem[] = [
  { label: 'Connections', icon: '◇', href: '/dashboard/connections' },
  { label: 'Billing', icon: '◆', href: '/dashboard/billing' },
  { label: 'Settings', icon: '⚙', href: '/dashboard/settings' },
]

function Item({ item }: { item: NavItem }) {
  const body = (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition ${
        item.active
          ? 'bg-[#00703c]/10 text-[#004225] font-semibold'
          : 'text-stone-800 hover:bg-stone-100 hover:text-stone-900'
      } ${item.soon ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className="text-base w-5 text-center">{item.icon}</span>
      <span>{item.label}</span>
      {item.soon && <span className="ml-auto text-[9px] text-stone-800 tracking-wider">SOON</span>}
    </div>
  )
  return item.href && !item.soon ? <Link href={item.href}>{body}</Link> : body
}

function Section({ title, items }: { title?: string; items: NavItem[] }) {
  return (
    <div className="space-y-0.5">
      {title && (
        <div className="text-[10px] text-stone-800 tracking-[0.15em] px-3 pt-4 pb-1 font-semibold">
          {title}
        </div>
      )}
      {items.map((i) => (
        <Item key={i.label} item={i} />
      ))}
    </div>
  )
}

export function DashboardSidebar({
  email,
  position,
  directRefs,
  indirectRefs,
}: {
  email: string
  position: number
  directRefs: number
  indirectRefs: number
}) {
  return (
    <aside className="w-60 shrink-0 border-r border-stone-200 bg-white/60 backdrop-blur-sm flex flex-col">
      <div className="p-4 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-stone-950 flex items-center justify-center ring-1 ring-emerald-400/30 shadow-sm overflow-hidden p-1.5 shrink-0">
            <Image
              src="/logo.png"
              alt="Sneakers"
              width={36}
              height={36}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-stone-700 tracking-wider">Enable O&apos;Toole</div>
            <div className="text-[11px] text-stone-800">Disabled · tap to config</div>
          </div>
          <div className="w-8 h-4 rounded-full bg-stone-300 relative">
            <div className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white shadow" />
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <Section title="MAIN" items={MAIN} />
        <Section title="TRADING" items={TRADING} />
        <Section title="O'TOOLE AI" items={OTOOLE} />
        <Section title="ACCOUNT" items={ACCOUNT} />

        <div className="pt-6 pb-3">
          <div className="text-[10px] text-stone-800 tracking-[0.15em] px-3 pb-1 font-semibold">
            CONNECTED SITES <span className="text-stone-700">0/12</span>
          </div>
          <div className="space-y-0.5">
            {['Kalshi', 'Polymarket'].map((s) => (
              <div key={s} className="flex items-center gap-3 px-3 py-2 text-sm text-stone-800">
                <span className="w-5 h-5 rounded bg-stone-200 flex items-center justify-center text-[10px] font-bold text-stone-800">
                  {s[0]}
                </span>
                <span>{s}</span>
                <span className="ml-auto text-[10px] text-[#00703c] hover:underline cursor-not-allowed">
                  Configure
                </span>
              </div>
            ))}
            <Link
              href="/venues"
              className="flex items-center gap-3 px-3 py-2 text-xs text-stone-700 hover:text-stone-800 hover:bg-stone-100 rounded"
            >
              <span className="w-5 text-center">⋯</span>
              <span>See all 12+ sites</span>
              <span className="ml-auto">→</span>
            </Link>
          </div>
        </div>

        {/* Waitlist status chip — compact version of the old dashboard */}
        <div className="mt-3 mx-2 p-3 rounded border border-[#00703c]/30 bg-[#00703c]/5">
          <div className="text-[9px] text-[#004225] tracking-[0.15em] font-semibold mb-1">
            WAITLIST STATUS
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xs text-stone-800">Position</div>
            <div className="text-lg font-bold text-[#00703c]">#{position.toLocaleString()}</div>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-xs text-stone-800">Referrals</div>
            <div className="text-xs text-stone-800 font-mono">
              {directRefs} · <span className="text-stone-700">{indirectRefs}</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Pinned profile — always visible at the bottom, always clickable. */}
      <div className="border-t border-stone-200 pt-3 bg-stone-50/50">
        <ProfileAvatar email={email} variant="sidebar" />
      </div>
    </aside>
  )
}
