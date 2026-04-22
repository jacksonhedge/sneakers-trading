import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'
import type { AlertRule } from '@/lib/alerts/types'
import { RuleForm } from '../../rule-form'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Edit alert rule — Sneakers Terminal' }

export default async function EditAlertPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) redirect(`/login?next=/dashboard/alerts/${id}/edit`)

  const admin = getServerClient()
  const { data: row } = await admin
    .from('waitlist')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .maybeSingle()
  if (!row) notFound()

  const { data: rule } = await admin
    .from('alert_rules')
    .select('*')
    .eq('id', id)
    .eq('user_id', row.id as string)
    .maybeSingle()
  if (!rule) notFound()

  const { count } = await admin
    .from('push_subscriptions')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', row.id as string)
  const pushAvailable = (count ?? 0) > 0

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <Link href="/dashboard/alerts" className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]">
          ← ALERTS
        </Link>
        <header>
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} EDIT RULE</div>
          <h1 className="text-3xl md:text-4xl font-bold">Edit alert rule</h1>
        </header>
        <RuleForm existing={rule as AlertRule} pushAvailable={pushAvailable} />
      </div>
    </main>
  )
}
