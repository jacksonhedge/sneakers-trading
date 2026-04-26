'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

// Auth callback. Handles BOTH delivery shapes that Supabase uses for
// magic-link flows:
//
// 1. **Hash fragment** (implicit flow) — the case admin.generateLink()
//    produces when the client has no PKCE code_verifier. URL looks like
//    `/auth/callback#access_token=X&refresh_token=Y&type=magiclink&...`.
//    The hash never reaches the server, so this MUST be a client page.
//
// 2. **Query param `?code=X`** (PKCE flow) — Supabase verify endpoint
//    redirects with this when there IS a code_verifier. We exchange the
//    code for a session via the browser client.
//
// After the session is set, we call POST /api/auth/post-signin to do
// server-side bookkeeping (mark waitlist invite_used_at, detect first
// sign-in, decide where to route). That endpoint sees the freshly-set
// session cookies and returns the destination URL.

export default function AuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [phase, setPhase] = useState<'pending' | 'syncing' | 'failed'>('pending')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !anon) {
        setErrorDetail('Missing Supabase env on client.')
        setPhase('failed')
        return
      }
      const supabase = createBrowserClient(url, anon)

      const nextParam = searchParams?.get('next') ?? null

      // 1) hash fragment first — admin.generateLink default behavior
      const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
      if (hash) {
        const params = new URLSearchParams(hash)
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (cancelled) return
          if (error) {
            setErrorDetail(error.message)
            setPhase('failed')
            return
          }
          await postSignin(router, nextParam)
          return
        }
      }

      // 2) ?code=X path — PKCE flow
      const code = searchParams?.get('code') ?? null
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (error) {
          setErrorDetail(error.message)
          setPhase('failed')
          return
        }
        await postSignin(router, nextParam)
        return
      }

      // 3) Neither — auth attempt arrived empty
      setErrorDetail('No auth token found. The link may have expired.')
      setPhase('failed')
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'failed') {
    return (
      <main className="min-h-screen bg-stone-950 text-white flex items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <div className="text-xs text-red-400 tracking-wider font-semibold mb-3">
            SIGN-IN FAILED
          </div>
          <h1 className="text-2xl font-bold mb-3">Couldn&apos;t complete sign-in.</h1>
          <p className="text-sm text-white/70 mb-6 leading-relaxed">
            {errorDetail ??
              'The link may have expired or already been used. Try signing up again.'}
          </p>
          <a
            href="/signup"
            className="inline-block bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold tracking-wider px-6 py-3 rounded transition"
          >
            BACK TO SIGN UP →
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-stone-950 text-white flex items-center justify-center p-8">
      <div className="text-center">
        <div className="text-xs text-emerald-300/80 tracking-wider font-semibold mb-3">
          SIGNING YOU IN
        </div>
        <div className="text-sm text-white/70">Setting your session…</div>
      </div>
    </main>
  )
}

async function postSignin(
  router: ReturnType<typeof useRouter>,
  nextParam: string | null,
) {
  // Server-side bookkeeping: mark invite_used_at, detect first-time signin,
  // pick the right destination. The server sees the cookies we just set.
  try {
    const res = await fetch('/api/auth/post-signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextParam ? { next: nextParam } : {}),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      next?: string
    }
    const dest = json?.next && isSafeRelativePath(json.next) ? json.next : '/dashboard'
    router.replace(dest)
  } catch {
    router.replace('/dashboard')
  }
}

// Defense-in-depth — server already validates, but never trust the wire.
function isSafeRelativePath(s: string): boolean {
  if (s.length === 0 || s.length > 512) return false
  if (!s.startsWith('/')) return false
  if (s.startsWith('//') || s.startsWith('/\\')) return false
  return true
}
