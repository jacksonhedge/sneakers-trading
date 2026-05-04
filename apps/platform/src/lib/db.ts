import pg from 'pg'

// Shared Postgres pool for Timescale reads. Reused across Server Component
// renders so we don't pay connection setup per-request. Module-scoped
// singleton keyed by process lifecycle.
//
// Connection string precedence:
//   1. POSTGRES_URL env var (set this in production / when not localhost)
//   2. postgresql://localhost:5432/sneakers (local dev default)
//
// Pool sizing notes:
//   - On Vercel Fluid each function instance is short-lived. With pg's
//     default behavior of holding `max` connections idle for
//     idleTimeoutMillis, we'd waste pgBouncer slots across thousands of
//     concurrent instances. The right answer for serverless + pgBouncer
//     transaction mode is max:1 — pgBouncer multiplexes for us, the
//     function only ever needs one connection at a time per request.
//   - For local dev (no POSTGRES_URL set, or a non-pooler URL), keep a
//     handful of connections for parallel queries inside one process.
//   - We detect the pooler by the `:6543` port in the URL.

let cachedPool: pg.Pool | null = null

export function getDbPool(): pg.Pool {
  if (cachedPool) return cachedPool
  const connectionString = process.env.POSTGRES_URL ?? 'postgresql://localhost:5432/sneakers'
  const isPooler = connectionString.includes(':6543')
  cachedPool = new pg.Pool({
    connectionString,
    // Serverless + pgBouncer: 1 conn per instance, pgBouncer fans out.
    // Local / direct: small pool for in-process parallelism.
    max: isPooler ? 1 : 10,
    // Quick failure if Timescale is down — lets JSONL fallback kick in
    // fast instead of blocking the dashboard render for ~30s. Bumped from
    // 2s → 5s because local pg's first connection establishment was
    // tripping the 2s ceiling and forcing a 4GB JSONL fallback scan.
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10_000,
  })
  // Swallow emitted errors so a transient DB hiccup doesn't crash the Node
  // process. The query-level try/catch in consumers is the real safety net.
  cachedPool.on('error', (err) => {
    console.warn('[db] pool error:', err.message)
  })
  return cachedPool
}

/**
 * Run a query with a short-circuit timeout. Returns null if the DB is
 * unreachable or the query fails — callers fall back to JSONL.
 */
export async function safeQuery<T extends pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T> | null> {
  const t0 = Date.now()
  try {
    const pool = getDbPool()
    const res = await pool.query<T>(sql, params)
    // Log slow queries (>3s) so we can spot when they're contributing to
    // function-timeout budgets. Successful queries are otherwise silent.
    const dur = Date.now() - t0
    if (dur > 3000) {
      const tag = sql.replace(/\s+/g, ' ').trim().slice(0, 80)
      console.warn(`[db] slow query ${dur}ms rows=${res.rowCount} sql="${tag}..."`)
    }
    return res
  } catch (e) {
    const dur = Date.now() - t0
    const tag = sql.replace(/\s+/g, ' ').trim().slice(0, 80)
    console.warn(
      `[db] query failed after ${dur}ms, falling back: ${(e as Error).message} sql="${tag}..."`,
    )
    return null
  }
}
