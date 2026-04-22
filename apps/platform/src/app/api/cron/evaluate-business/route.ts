import { runEvaluation } from '@/lib/alerts/cron'

// Vercel cron: every minute. Standard Business subscribers only.
// Fraternity (business_subtype = 'fraternity') is handled by the standard
// 5-min cron — they pay less, they get the slower cadence.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  if (!checkCronAuth(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const summary = await runEvaluation('business')
  return Response.json({ ok: true, summary })
}

export async function GET(req: Request) {
  if (!checkCronAuth(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const summary = await runEvaluation('business')
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
