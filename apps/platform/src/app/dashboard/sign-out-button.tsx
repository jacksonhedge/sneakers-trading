'use client'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export function SignOutButton() {
  const router = useRouter()

  async function signOut() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) return
    const supabase = createBrowserClient(url, anon)
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="text-xs text-stone-600 hover:text-[#00703c] tracking-wider transition"
    >
      SIGN OUT
    </button>
  )
}
