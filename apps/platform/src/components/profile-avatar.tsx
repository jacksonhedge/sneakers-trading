import Image from 'next/image'
import Link from 'next/link'
import { avatarGradientClass, avatarRingClass } from '@/lib/avatar-defaults'

interface Props {
  email: string | null | undefined
  /** Public URL of the user's uploaded avatar. Wins over emoji/color when set. */
  avatarUrl?: string | null
  /** Random emoji assigned at signup. Renders as the fallback when avatarUrl is null. */
  avatarEmoji?: string | null
  /** Color key from AVATAR_COLOR_KEYS in lib/avatar-defaults.ts. */
  avatarColor?: string | null
  variant?: 'topbar' | 'sidebar'
}

export function ProfileAvatar({
  email,
  avatarUrl,
  avatarEmoji,
  avatarColor,
  variant = 'topbar',
}: Props) {
  const hasImage = typeof avatarUrl === 'string' && avatarUrl.length > 0
  const fallbackContent = avatarEmoji && avatarEmoji.length > 0
    ? avatarEmoji
    : (email?.[0]?.toUpperCase() ?? '?')
  const gradient = avatarGradientClass(avatarColor)
  const ring = avatarRingClass(avatarColor)

  if (variant === 'topbar') {
    return (
      <Link
        href="/dashboard/profile"
        prefetch={false}
        title={email ?? 'Profile'}
        aria-label="Profile"
        className={`relative w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-base font-bold ring-1 ${ring} shadow-sm hover:ring-2 hover:ring-emerald-400 hover:shadow-md transition`}
      >
        {hasImage ? (
          <Image
            src={avatarUrl!}
            alt="Profile"
            width={32}
            height={32}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <span className="leading-none">{fallbackContent}</span>
        )}
      </Link>
    )
  }

  // sidebar — wider card with label + subtext
  return (
    <Link
      href="/dashboard/profile"
      prefetch={false}
      className="flex items-center gap-3 p-3 mx-2 mb-2 rounded bg-white hover:bg-stone-100 transition ring-1 ring-stone-200 hover:ring-[#00703c]/40 group"
    >
      <div
        className={`relative w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-base font-bold ring-1 ${ring} shadow-sm shrink-0`}
      >
        {hasImage ? (
          <Image
            src={avatarUrl!}
            alt="Profile"
            width={36}
            height={36}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <span className="leading-none">{fallbackContent}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-stone-900 truncate">
          {email ?? 'Profile'}
        </div>
        <div className="text-[10px] text-stone-500 group-hover:text-[#00703c] transition">
          Profile & settings →
        </div>
      </div>
    </Link>
  )
}
