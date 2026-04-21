import { getServerClient } from '@/lib/supabase-server'
import { sendWaitlistConfirmation } from '@/lib/email'
import { displayedPosition } from '@/lib/waitlist'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { email?: unknown; source?: unknown }
  const { email, source } = body

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const supabase = getServerClient()

  const { error } = await supabase
    .from('waitlist')
    .insert({
      email: normalizedEmail,
      source: typeof source === 'string' ? source : 'landing',
      referrer: req.headers.get('referer'),
      ip_country:
        req.headers.get('cf-ipcountry') ?? req.headers.get('x-vercel-ip-country'),
    })

  const isDuplicate = error?.code === '23505'
  if (error && !isDuplicate) {
    console.error('waitlist insert failed:', error)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  // Skip email on duplicate signups — don't spam existing members.
  if (!isDuplicate) {
    const { count } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true })

    const position = displayedPosition(count ?? 0)
    await sendWaitlistConfirmation({ to: normalizedEmail, position })
  }

  return Response.json({ ok: true })
}
