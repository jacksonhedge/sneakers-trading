import { runEvaluation } from '@/lib/alerts/cron'

// Vercel cron: every 5 minutes (see apps/platform/vercel.json).
// Evaluates alert rules for Pro and Elite subscribers, plus the
// Fraternity sub-flavor of Business (5-min cadence per the brief). The
// 1-min Business cron is /api/cron/evaluate-business.
//
// Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`. Reject anything
// else with 401 — the route URL is public, the secret is the gate.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Long-running: snapshot reads + per-rule evaluation. Vercel allows up to
// 300s on Pro plans; bump if we ever start timing out.
export const maxDuration = 60

export async function POST(req: Request) {
  if (!checkCronAuth(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const summary = await runEvaluation('standard')
  return Response.json({ ok: true, summary })
}

// Vercel cron defaults to GET; support both.
export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const summary = await runEvaluation('standard')
  return Response.json({ ok: true, summary })
}

function checkCronAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    console.error('[cron] CRON_SECRET not set — refusing all requests')
    return false
  }
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${expected}`
}
