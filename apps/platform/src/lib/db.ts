import pg from 'pg'

// Shared Postgres pool for Timescale reads. Reused across Server Component
// renders so we don't pay connection setup per-request. Module-scoped
// singleton keyed by process lifecycle.
//
// Connection string precedence:
//   1. POSTGRES_URL env var (set this in production / when not localhost)
//   2. postgresql://localhost:5432/sneakers (local dev default)

let cachedPool: pg.Pool | null = null

export function getDbPool(): pg.Pool {
  if (cachedPool) return cachedPool
  const connectionString = process.env.POSTGRES_URL ?? 'postgresql://localhost:5432/sneakers'
  cachedPool = new pg.Pool({
    connectionString,
    max: 10,
    // Quick failure if Timescale is down — lets JSONL fallback kick in
    // within 2s instead of blocking the dashboard render for ~30s.
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30_000,
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
  try {
    const pool = getDbPool()
    const res = await pool.query<T>(sql, params)
    return res
  } catch (e) {
    console.warn('[db] query failed, falling back:', (e as Error).message)
    return null
  }
}
