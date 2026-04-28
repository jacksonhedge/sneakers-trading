import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { ResetPasswordForm } from './reset-password-form'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Reset password — Sneakers Terminal',
}

export default async function ResetPasswordPage() {
  // The user reaches this page after clicking a recovery link, which
  // /auth/callback exchanges for a session. If they hit it without a
  // session, send them to /forgot-password to start fresh.
  const sb = await getAuthClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/forgot-password')

  return (
    <main className="relative min-h-screen flex items-center justify-center p-8 overflow-hidden isolate bg-stone-50">
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-br from-stone-50 via-white to-stone-100"
        aria-hidden
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-[720px] h-[720px] rounded-full bg-emerald-300/20 blur-[120px] pointer-events-none"
        aria-hidden
      />

      <div className="max-w-md w-full space-y-6 text-stone-900">
        <div className="text-center">
          <div className="text-xs text-emerald-700 mb-4 tracking-wider font-semibold">
            SNEAKERS TERMINAL / NEW PASSWORD
          </div>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-stone-950 p-3 ring-1 ring-emerald-500/30 shadow-[0_8px_32px_rgba(16,185,129,0.18)]">
              <Image src="/logo.png" alt="Sneakers" width={96} height={96} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white ring-1 ring-stone-200 shadow-[0_12px_32px_rgba(0,0,0,0.08)] p-6 space-y-4">
          <div className="text-sm text-emerald-700 font-semibold">
            {'>'} Pick a new password.
          </div>
          <div className="text-xs text-stone-600 leading-relaxed">
            Resetting for{' '}
            <span className="font-mono text-stone-900">{user.email}</span>. After you
            save, we&apos;ll drop you on the dashboard.
          </div>
          <ResetPasswordForm />
          <div className="text-xs text-stone-500 pt-2 border-t border-stone-200">
            Wrong account?{' '}
            <Link
              href="/login"
              className="text-emerald-700 hover:text-emerald-800 font-semibold underline"
            >
              Sign in as someone else →
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
