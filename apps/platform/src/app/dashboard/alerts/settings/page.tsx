import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import { SettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Alert settings — Sneakers Terminal' }

export default async function AlertSettingsPage() {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) redirect('/login?next=/dashboard/alerts/settings')

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()

  let initial = {
    email_enabled: true,
    email_digest_mode: false,
    push_enabled: true,
    quiet_hours_start: null as number | null,
    quiet_hours_end: null as number | null,
    quiet_hours_tz: 'America/New_York',
    push_subscription_count: 0,
  }
  if (row?.id) {
    const [{ data: prefs }, { count }] = await Promise.all([
      admin.from('alert_delivery_prefs').select('*').eq('user_id', row.id as string).maybeSingle(),
      admin
        .from('push_subscriptions')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', row.id as string),
    ])
    if (prefs) {
      initial = {
        email_enabled: prefs.email_enabled,
        email_digest_mode: prefs.email_digest_mode,
        push_enabled: prefs.push_enabled,
        quiet_hours_start: prefs.quiet_hours_start,
        quiet_hours_end: prefs.quiet_hours_end,
        quiet_hours_tz: prefs.quiet_hours_tz ?? 'America/New_York',
        push_subscription_count: count ?? 0,
      }
    } else {
      initial.push_subscription_count = count ?? 0
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <Link href="/dashboard/alerts" className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]">
          ← ALERTS
        </Link>
        <header>
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} SETTINGS</div>
          <h1 className="text-3xl md:text-4xl font-bold">Delivery preferences</h1>
          <p className="text-sm text-stone-600 mt-2 max-w-2xl">
            Control how alerts reach you. Quiet hours skip notifications during the window — they
            do not queue, so you might miss fires that resolve quickly. Re-fires next cycle if
            conditions still hold.
          </p>
        </header>

        <SettingsForm initial={initial} />
      </div>
    </main>
  )
}
