import { NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/supabase-auth'
import { getServerClient } from '@/lib/supabase-server'

// POST /api/profile/avatar  → save the public URL of an avatar that the
//                              client just uploaded directly to the
//                              "avatars" Supabase Storage bucket.
//                              Body: { url: string }
//
// DELETE /api/profile/avatar → clear the avatar URL (UI falls back to
//                              the colored-initial circle).
//
// The actual file upload happens client-side via the Supabase JS client
// against the public-read / write-own-folder bucket — keeps Vercel
// function bandwidth out of the picture and gives us Supabase's CDN.
// This endpoint just persists the resulting URL on the waitlist row.
//
// We validate that the URL points at our own avatars bucket so the
// client can't trick us into displaying an arbitrary remote image as
// the user's profile pic (XSS / tracking pixel risk).

export const dynamic = 'force-dynamic'

const ALLOWED_HOST_SUFFIX = '.supabase.co'
const REQUIRED_PATH_FRAGMENT = '/storage/v1/object/public/avatars/'

function isOurAvatarUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 1000) return false
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    if (!u.hostname.endsWith(ALLOWED_HOST_SUFFIX)) return false
    if (!u.pathname.includes(REQUIRED_PATH_FRAGMENT)) return false
    return true
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as { url?: unknown }
  if (!isOurAvatarUrl(body.url)) {
    return NextResponse.json(
      { ok: false, error: 'invalid_url', message: 'URL must point at the avatars bucket on Supabase Storage.' },
      { status: 400 },
    )
  }

  const admin = getServerClient()
  const { error } = await admin
    .from('waitlist')
    .update({ avatar_url: body.url })
    .eq('email', user.email.toLowerCase())
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, url: body.url })
}

export async function DELETE() {
  const sb = await getAuthClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !user.email) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }
  const admin = getServerClient()
  const { error } = await admin
    .from('waitlist')
    .update({ avatar_url: null })
    .eq('email', user.email.toLowerCase())
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
