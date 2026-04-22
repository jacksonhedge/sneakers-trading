// Shared helpers for stress-test scripts.
// Reads TARGET from env (defaults to production). Emails are tagged so the
// /admin/system cleanup button can wipe them after a run.

export const TARGET = process.env.TARGET ?? 'https://sneakersterminal.com'

export function stressEmail(tag: string, n: number | string): string {
  return `stress+${tag}-${n}@sneakersterminal.com`
}

type TimedResult = {
  status: number
  ms: number
  body: unknown
  error?: string
}

export async function timedFetch(
  url: string,
  init?: RequestInit,
): Promise<TimedResult> {
  const start = performance.now()
  try {
    const res = await fetch(url, init)
    const ms = performance.now() - start
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = await res.text().catch(() => null)
    }
    return { status: res.status, ms, body }
  } catch (err) {
    return {
      status: 0,
      ms: performance.now() - start,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function summarize(ms: number[]): { p50: number; p95: number; max: number; n: number } {
  if (ms.length === 0) return { p50: 0, p95: 0, max: 0, n: 0 }
  const sorted = [...ms].sort((a, b) => a - b)
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  return {
    p50: Math.round(p(0.5)),
    p95: Math.round(p(0.95)),
    max: Math.round(sorted[sorted.length - 1]),
    n: sorted.length,
  }
}
