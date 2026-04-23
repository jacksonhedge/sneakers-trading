import Link from 'next/link'

interface Props {
  email: string | null | undefined
  variant?: 'topbar' | 'sidebar'
}

export function ProfileAvatar({ email, variant = 'topbar' }: Props) {
  const initial = email?.[0]?.toUpperCase() ?? '?'

  if (variant === 'topbar') {
    return (
      <Link
        href="/dashboard/settings"
        title={email ?? 'Profile'}
        aria-label="Profile"
        className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-sm font-bold ring-1 ring-emerald-600/40 shadow-sm hover:ring-2 hover:ring-emerald-400 hover:shadow-md transition"
      >
        {initial}
      </Link>
    )
  }

  // sidebar — wider card with label + subtext, pinned at the bottom
  return (
    <Link
      href="/dashboard/settings"
      className="flex items-center gap-3 p-3 mx-2 mb-2 rounded bg-white hover:bg-stone-100 transition ring-1 ring-stone-200 hover:ring-[#00703c]/40 group"
    >
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white text-sm font-bold ring-1 ring-emerald-600/40 shadow-sm shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-stone-900 truncate">
          {email ?? 'Profile'}
        </div>
        <div className="text-[10px] text-stone-500 group-hover:text-[#00703c] transition">
          Settings & billing →
        </div>
      </div>
    </Link>
  )
}
