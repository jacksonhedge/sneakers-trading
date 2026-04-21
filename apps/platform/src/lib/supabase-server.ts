import { createClient } from '@supabase/supabase-js'

export function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)',
    )
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}
