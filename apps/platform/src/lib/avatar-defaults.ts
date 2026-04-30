// Default avatar assets — every new user gets one random emoji from
// AVATAR_EMOJI_POOL paired with one color key from AVATAR_COLOR_KEYS at
// signup, persisted on waitlist.{avatar_emoji, avatar_color}. When the
// user uploads a photo, that wins (rendered from waitlist.avatar_url);
// otherwise the chrome falls back to <emoji + gradient> instead of the
// boring colored-letter circle.
//
// Same pools also drive the migration backfill (031_user_avatar_defaults.sql)
// — keep these arrays in lockstep with the SQL arrays there or backfill
// will pick from an out-of-date set.

export const AVATAR_EMOJI_POOL = [
  '🎯', '🚀', '⚡', '🔥', '💎', '🎲', '🦊', '🐺', '🦁', '🐯',
  '🦄', '🌈', '🎮', '🏆', '⭐', '🌟', '🎸', '🎨', '🍕', '🌮',
  '☕', '🪐', '🎪', '🎭', '🎬', '📚', '✈️', '🏔️', '🌊', '🦅',
  '🐉', '🌸', '🌻', '🍀', '🥷', '🐝', '👾', '🎷', '🥁', '🛹',
] as const

export const AVATAR_COLOR_KEYS = [
  'emerald', 'teal', 'sky', 'blue', 'indigo', 'violet',
  'fuchsia', 'rose', 'orange', 'amber', 'lime', 'cyan',
] as const
export type AvatarColorKey = (typeof AVATAR_COLOR_KEYS)[number]

const GRADIENT_BY_KEY: Record<AvatarColorKey, string> = {
  emerald: 'from-emerald-500 to-emerald-700',
  teal:    'from-teal-500 to-teal-700',
  sky:     'from-sky-500 to-sky-700',
  blue:    'from-blue-500 to-blue-700',
  indigo:  'from-indigo-500 to-indigo-700',
  violet:  'from-violet-500 to-violet-700',
  fuchsia: 'from-fuchsia-500 to-fuchsia-700',
  rose:    'from-rose-500 to-rose-700',
  orange:  'from-orange-500 to-orange-700',
  amber:   'from-amber-500 to-amber-700',
  lime:    'from-lime-500 to-lime-700',
  cyan:    'from-cyan-500 to-cyan-700',
}

const RING_BY_KEY: Record<AvatarColorKey, string> = {
  emerald: 'ring-emerald-600/40',
  teal:    'ring-teal-600/40',
  sky:     'ring-sky-600/40',
  blue:    'ring-blue-600/40',
  indigo:  'ring-indigo-600/40',
  violet:  'ring-violet-600/40',
  fuchsia: 'ring-fuchsia-600/40',
  rose:    'ring-rose-600/40',
  orange:  'ring-orange-600/40',
  amber:   'ring-amber-600/40',
  lime:    'ring-lime-600/40',
  cyan:    'ring-cyan-600/40',
}

export function avatarGradientClass(key: string | null | undefined): string {
  if (key && key in GRADIENT_BY_KEY) return GRADIENT_BY_KEY[key as AvatarColorKey]
  return GRADIENT_BY_KEY.emerald
}

export function avatarRingClass(key: string | null | undefined): string {
  if (key && key in RING_BY_KEY) return RING_BY_KEY[key as AvatarColorKey]
  return RING_BY_KEY.emerald
}

/**
 * Pick a fresh emoji + color for a brand-new user. Math.random is fine
 * here — these are cosmetic, not security-sensitive.
 */
export function pickAvatarDefaults(): { emoji: string; color: AvatarColorKey } {
  const emoji =
    AVATAR_EMOJI_POOL[Math.floor(Math.random() * AVATAR_EMOJI_POOL.length)]
  const color =
    AVATAR_COLOR_KEYS[Math.floor(Math.random() * AVATAR_COLOR_KEYS.length)]
  return { emoji, color }
}
