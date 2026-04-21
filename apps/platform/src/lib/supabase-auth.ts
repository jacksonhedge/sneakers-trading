import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Auth-aware Supabase client for server components and route handlers.
 * Reads the Supabase session from cookies and can refresh the access token
 * by writing back updated cookies.
 *
 * For server components (Page / Layout) and Route Handlers both. In server
 * components we wrap setAll in a try/catch because those contexts can't set
 * cookies — Next.js will throw, and the Supabase docs say to ignore it since
 * middleware or subsequent route handlers will refresh.
 */
export async function getAuthClient() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env vars')
  }
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component where cookies can't be set.
          // Sessions still get refreshed by route handlers / the middleware.
        }
      },
    },
  })
}
