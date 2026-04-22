#!/usr/bin/env tsx
// Delete every waitlist row whose email starts with `stress+` or `stress-`.
// Uses the service_role key directly so cleanup works even if ADMIN_EMAILS
// / the /admin UI aren't wired up yet.
//
// Usage (from apps/platform):
//   pnpm admin:stress:cleanup

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'

loadEnv({ path: path.join(process.cwd(), '.env.local') })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data, error } = await admin
    .from('waitlist')
    .delete()
    .or('email.like.stress+%,email.like.stress-%')
    .select('email')

  if (error) {
    console.error('delete failed:', error.message)
    process.exit(1)
  }

  const rows = data ?? []
  console.log(`deleted ${rows.length} stress-test row${rows.length === 1 ? '' : 's'}`)
  for (const r of rows) {
    console.log(`  - ${r.email}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
