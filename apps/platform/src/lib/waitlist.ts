import { getServerClient } from './supabase-server'

// Displayed number = real count + DISPLAY_OFFSET. Seeded to show 56 at launch
// (1 real row → 56 displayed). Each new signup increments naturally.
export const WAITLIST_DISPLAY_OFFSET = 55

export async function getWaitlistCount(): Promise<number> {
  const supabase = getServerClient()
  const { count, error } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact', head: true })

  if (error || count === null) {
    return 0
  }
  return count
}

export function displayedPosition(realCount: number): number {
  return realCount + WAITLIST_DISPLAY_OFFSET
}
