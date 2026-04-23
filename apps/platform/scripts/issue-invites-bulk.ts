#!/usr/bin/env tsx
// Bulk invite-code issuer for the 100-testers push.
//
// Usage (from apps/platform):
//   pnpm admin:invite:bulk --from-file emails.txt --csv-out results.csv
//   pnpm admin:invite:bulk --from-file emails.txt --no-email --create-missing
//   pnpm admin:invite:bulk a@x.com b@x.com --dry-run
//
// Flags:
//   --from-file <path>   Read emails one-per-line from a file (# = comment).
//   --csv-out <path>     Append per-email results to a CSV (email, code,
//                        status, signup_url, note). Opens in append mode so
//                        a retry run continues the same log.
//   --no-email           Issue codes + update DB but skip the Resend call.
//                        Useful when WAITLIST_FROM_EMAIL / domain aren't
//                        verified yet. Codes still printed to stdout and
//                        CSV so the operator can mail-merge manually.
//   --create-missing     If an email has no waitlist row, INSERT one with
//                        source='bulk-invite' instead of skipping. Needed
//                        for cold-list outreach where the invitee hasn't
//                        hit the waitlist form yet.
//   --force              Re-issue a new code for emails that already have
//                        one. Burns the old code. Default: skip.
//   --dry-run            Simulate everything. No DB writes, no emails, no
//                        CSV output. Prints what would have happened.
//
// Per-email outcome status values (written to CSV + stdout):
//   issued            — new code generated, DB updated, email sent (or skipped per --no-email)
//   skipped_invited   — already had an invite_code and --force not set
//   skipped_no_row    — not on waitlist and --create-missing not set
//   created_issued    — inserted new waitlist row AND issued code (--create-missing)
//   error             — DB or codegen failure; row unchanged. See note column.
//   dry_would_issue   — --dry-run; would have issued
//   dry_would_skip    — --dry-run; would have skipped

import 'dotenv/config'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { generateUniqueInviteCode } from '../src/lib/invite-code'
import { sendInviteEmail } from '../src/lib/email'

loadEnv({ path: path.join(process.cwd(), '.env.local') })

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sneakersterminal.com'

type Flags = {
  fromFile: string | null
  csvOut: string | null
  noEmail: boolean
  createMissing: boolean
  force: boolean
  dryRun: boolean
  positional: string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    fromFile: null,
    csvOut: null,
    noEmail: false,
    createMissing: false,
    force: false,
    dryRun: false,
    positional: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from-file') flags.fromFile = argv[++i] ?? null
    else if (a === '--csv-out') flags.csvOut = argv[++i] ?? null
    else if (a === '--no-email') flags.noEmail = true
    else if (a === '--create-missing') flags.createMissing = true
    else if (a === '--force') flags.force = true
    else if (a === '--dry-run') flags.dryRun = true
    else if (a.startsWith('--')) {
      console.error(`unknown flag: ${a}`)
      process.exit(1)
    } else flags.positional.push(a)
  }
  return flags
}

function readEmailsFromFile(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return text
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l.length > 0)
}

// Cheap shape check — sales eyeballs the CSV before mailing anyway.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function normalizeEmail(raw: string): string | null {
  const e = raw.toLowerCase().trim()
  if (!EMAIL_RE.test(e)) return null
  if (e.length > 320) return null
  return e
}

type Outcome = {
  email: string
  code: string | null
  status:
    | 'issued'
    | 'created_issued'
    | 'skipped_invited'
    | 'skipped_no_row'
    | 'skipped_bad_email'
    | 'error'
    | 'dry_would_issue'
    | 'dry_would_skip'
  signupUrl: string | null
  note: string | null
}

function csvEscape(v: string | null): string {
  const s = v ?? ''
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function appendCsv(file: string, row: Outcome) {
  if (!existsSync(file)) {
    writeFileSync(file, 'email,code,status,signup_url,note\n', 'utf8')
  }
  const line =
    [
      csvEscape(row.email),
      csvEscape(row.code),
      csvEscape(row.status),
      csvEscape(row.signupUrl),
      csvEscape(row.note),
    ].join(',') + '\n'
  appendFileSync(file, line, 'utf8')
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))

  // Collect emails from --from-file + positional args; dedupe and sanitize.
  const raw: string[] = []
  if (flags.fromFile) {
    try {
      raw.push(...readEmailsFromFile(flags.fromFile))
    } catch (err) {
      console.error(`failed to read ${flags.fromFile}:`, err instanceof Error ? err.message : err)
      process.exit(1)
    }
  }
  raw.push(...flags.positional)

  if (raw.length === 0) {
    console.error(
      'no emails provided. pass positional args or use --from-file. run with no args for help.',
    )
    console.error('see script header for flag docs.')
    process.exit(1)
  }

  const seen = new Set<string>()
  const emails: string[] = []
  const badShape: string[] = []
  for (const r of raw) {
    const e = normalizeEmail(r)
    if (!e) {
      badShape.push(r)
      continue
    }
    if (seen.has(e)) continue
    seen.add(e)
    emails.push(e)
  }

  console.log(`\n[bulk-invite] target=${flags.dryRun ? 'DRY-RUN' : 'LIVE'}`)
  console.log(`[bulk-invite] input=${raw.length}  unique-valid=${emails.length}  bad-shape=${badShape.length}`)
  if (flags.noEmail) console.log(`[bulk-invite] --no-email (skipping Resend)`)
  if (flags.createMissing) console.log(`[bulk-invite] --create-missing (auto-insert waitlist rows)`)
  if (flags.force) console.log(`[bulk-invite] --force (re-issue existing codes)`)
  console.log('')

  // Env check — even in dry-run we need the DB to see which emails exist.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const outcomes: Outcome[] = []
  for (const bad of badShape) {
    const o: Outcome = {
      email: bad,
      code: null,
      status: 'skipped_bad_email',
      signupUrl: null,
      note: 'failed email regex',
    }
    outcomes.push(o)
    if (flags.csvOut) appendCsv(flags.csvOut, o)
    console.log(`  [bad]       ${bad}`)
  }

  // Counters for summary.
  let issued = 0
  let skipped = 0
  let errors = 0

  for (const email of emails) {
    const { data: row, error: selectErr } = await admin
      .from('waitlist')
      .select('email, invite_code, invited_at')
      .eq('email', email)
      .maybeSingle()

    if (selectErr) {
      const o: Outcome = { email, code: null, status: 'error', signupUrl: null, note: `lookup: ${selectErr.message}` }
      outcomes.push(o)
      if (flags.csvOut) appendCsv(flags.csvOut, o)
      console.log(`  [error]     ${email} — lookup failed: ${selectErr.message}`)
      errors++
      continue
    }

    const existsOnWaitlist = Boolean(row)
    const hasCode = Boolean(row?.invite_code)

    // Skip when already invited and no --force.
    if (hasCode && !flags.force) {
      const o: Outcome = {
        email,
        code: (row!.invite_code as string) ?? null,
        status: flags.dryRun ? 'dry_would_skip' : 'skipped_invited',
        signupUrl: row?.invite_code ? `${SITE_URL}/signup?code=${row.invite_code}` : null,
        note: `existing code, invited ${row?.invited_at ?? '?'}`,
      }
      outcomes.push(o)
      if (flags.csvOut && !flags.dryRun) appendCsv(flags.csvOut, o)
      console.log(`  [skip-inv]  ${email} — already has ${row!.invite_code}`)
      skipped++
      continue
    }

    // Skip / create when missing.
    if (!existsOnWaitlist && !flags.createMissing) {
      const o: Outcome = {
        email,
        code: null,
        status: flags.dryRun ? 'dry_would_skip' : 'skipped_no_row',
        signupUrl: null,
        note: 'not on waitlist; run with --create-missing to auto-add',
      }
      outcomes.push(o)
      if (flags.csvOut && !flags.dryRun) appendCsv(flags.csvOut, o)
      console.log(`  [skip-new]  ${email} — not on waitlist`)
      skipped++
      continue
    }

    if (flags.dryRun) {
      const o: Outcome = {
        email,
        code: null,
        status: 'dry_would_issue',
        signupUrl: null,
        note: existsOnWaitlist ? 'would re-issue' : 'would create + issue',
      }
      outcomes.push(o)
      console.log(`  [dry]       ${email} — would ${existsOnWaitlist ? 're-issue' : 'create + issue'}`)
      issued++
      continue
    }

    // Generate a unique code via the server helper so we stay consistent with
    // /api/auth flows. One-off race here is acceptable for bulk use.
    let code: string
    try {
      code = await generateUniqueInviteCode()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const o: Outcome = { email, code: null, status: 'error', signupUrl: null, note: `codegen: ${msg}` }
      outcomes.push(o)
      if (flags.csvOut) appendCsv(flags.csvOut, o)
      console.log(`  [error]     ${email} — code-gen failed: ${msg}`)
      errors++
      continue
    }

    if (!existsOnWaitlist && flags.createMissing) {
      const { error: insErr } = await admin.from('waitlist').insert({
        email,
        source: 'bulk-invite',
        invite_code: code,
        invited_at: new Date().toISOString(),
      })
      if (insErr) {
        const o: Outcome = { email, code: null, status: 'error', signupUrl: null, note: `insert: ${insErr.message}` }
        outcomes.push(o)
        if (flags.csvOut) appendCsv(flags.csvOut, o)
        console.log(`  [error]     ${email} — insert failed: ${insErr.message}`)
        errors++
        continue
      }
    } else {
      const { error: updErr } = await admin
        .from('waitlist')
        .update({
          invite_code: code,
          invited_at: new Date().toISOString(),
          invite_used_at: null,
        })
        .eq('email', email)
      if (updErr) {
        const o: Outcome = { email, code: null, status: 'error', signupUrl: null, note: `update: ${updErr.message}` }
        outcomes.push(o)
        if (flags.csvOut) appendCsv(flags.csvOut, o)
        console.log(`  [error]     ${email} — update failed: ${updErr.message}`)
        errors++
        continue
      }
    }

    const signupUrl = `${SITE_URL}/signup?code=${code}`
    if (!flags.noEmail) {
      // sendInviteEmail silently no-ops if RESEND_API_KEY is unset. It catches
      // its own errors and logs them — we don't see them here, but the CSV
      // will still show status=issued. Trade-off: the operator should verify
      // delivery on a sample before trusting the full batch.
      await sendInviteEmail({ to: email, code })
    }

    const o: Outcome = {
      email,
      code,
      status: existsOnWaitlist ? 'issued' : 'created_issued',
      signupUrl,
      note: flags.noEmail ? 'email skipped (--no-email)' : null,
    }
    outcomes.push(o)
    if (flags.csvOut) appendCsv(flags.csvOut, o)
    console.log(`  [${o.status.padEnd(15)}] ${email} → ${code}`)
    issued++
  }

  console.log('')
  console.log(`[bulk-invite] done.  issued=${issued}  skipped=${skipped}  errors=${errors}  total=${outcomes.length}`)
  if (flags.csvOut) console.log(`[bulk-invite] CSV: ${flags.csvOut}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
