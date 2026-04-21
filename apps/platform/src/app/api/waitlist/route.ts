import { getServerClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { email?: unknown; source?: unknown }
  const { email, source } = body

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return Response.json({ error: 'invalid_email' }, { status: 400 })
  }

  const supabase = getServerClient()
  const { error } = await supabase
    .from('waitlist')
    .insert({
      email: email.toLowerCase().trim(),
      source: typeof source === 'string' ? source : 'landing',
      referrer: req.headers.get('referer'),
      ip_country: req.headers.get('cf-ipcountry'),
    })

  // unique_violation on email = already signed up; treat as success
  if (error && error.code !== '23505') {
    console.error('waitlist insert failed:', error)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
