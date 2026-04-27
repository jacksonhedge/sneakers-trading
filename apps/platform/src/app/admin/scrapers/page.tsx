import { promises as fs } from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

type PlatformStats = {
  platform: string
  latestFile: string | null
  latestRows: number
  latestBytes: number
  latestMtime: string | null
  daysOnDisk: number
  totalBytesAllDays: number
}

// Platforms intentionally excluded from the live scrape loop. Surfaces as a
// "DISABLED · NEEDS FIX" badge on the per-platform table so we don't forget
// to fix + re-enable them. Keep in sync with scripts/scrape-loop.sh.
const DISABLED_PLATFORMS: Record<string, { since: string; reason: string }> = {
  prizepicks: {
    since: '2026-04-26',
    reason:
      '60–90 min per run blocks the loop and leaves oddsapi ~90min stale. Fix: parallelize per-league requests or move to a separate slow-cadence loop, then re-enable in scripts/scrape-loop.sh.',
  },
  underdog: {
    since: '2026-04-22',
    reason:
      'Auth0 JWT expires every ~10 min and we have no refresh path outside a real browser. Fix: rotate UNDERDOG_BEARER_TOKEN manually + run `pnpm scrape:underdog`, or build a token-refresh service.',
  },
}

type QuotaEntry = {
  ts: string
  used: number | null
  remaining: number | null
  snapshots: number | null
  sports: number | null
}

function dataDirCandidates(): string[] {
  return [
    path.join(process.cwd(), '..', 'trader', 'data'),
    path.join(process.cwd(), 'apps', 'trader', 'data'),
  ]
}

async function resolveDataDir(): Promise<string | null> {
  for (const d of dataDirCandidates()) {
    try {
      await fs.access(d)
      return d
    } catch {}
  }
  return null
}

async function loadPlatformStats(dataDir: string): Promise<PlatformStats[]> {
  const entries = await fs.readdir(dataDir, { withFileTypes: true }).catch(() => [])
  const platforms = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()

  const out: PlatformStats[] = []
  for (const platform of platforms) {
    const dir = path.join(dataDir, platform)
    const files = await fs.readdir(dir).catch(() => [])
    const jsonl = files.filter((f) => f.endsWith('.jsonl')).sort()
    if (jsonl.length === 0) {
      out.push({
        platform,
        latestFile: null,
        latestRows: 0,
        latestBytes: 0,
        latestMtime: null,
        daysOnDisk: 0,
        totalBytesAllDays: 0,
      })
      continue
    }
    const latestName = jsonl[jsonl.length - 1]
    const latestPath = path.join(dir, latestName)
    const [buf, stat] = await Promise.all([
      fs.readFile(latestPath, 'utf8').catch(() => ''),
      fs.stat(latestPath).catch(() => null),
    ])
    const rows = buf ? buf.split('\n').filter(Boolean).length : 0
    let totalBytes = 0
    for (const f of jsonl) {
      const s = await fs.stat(path.join(dir, f)).catch(() => null)
      if (s) totalBytes += s.size
    }
    out.push({
      platform,
      latestFile: latestName,
      latestRows: rows,
      latestBytes: stat?.size ?? 0,
      latestMtime: stat?.mtime?.toISOString() ?? null,
      daysOnDisk: jsonl.length,
      totalBytesAllDays: totalBytes,
    })
  }
  return out
}

async function loadQuotaHistory(dataDir: string): Promise<QuotaEntry[]> {
  const quotaFile = path.join(dataDir, 'oddsapi', '.quota.jsonl')
  try {
    const text = await fs.readFile(quotaFile, 'utf8')
    const out: QuotaEntry[] = []
    for (const line of text.split('\n')) {
      const s = line.trim()
      if (!s) continue
      try {
        out.push(JSON.parse(s) as QuotaEntry)
      } catch {}
    }
    return out
  } catch {
    return []
  }
}

function formatBytes(b: number): string {
  if (b >= 1_000_000_000) return `${(b / 1_000_000_000).toFixed(1)} GB`
  if (b >= 1_000_000) return `${(b / 1_000_000).toFixed(1)} MB`
  if (b >= 1_000) return `${(b / 1_000).toFixed(1)} KB`
  return `${b} B`
}

function formatAge(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const mins = ms / 60000
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.round(mins)}m ago`
  const hrs = mins / 60
  if (hrs < 24) return `${Math.round(hrs)}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function projectQuotaRunway(entries: QuotaEntry[]): { burnPerDay: number; daysRemaining: number | null } | null {
  if (entries.length < 2) return null
  const first = entries[0]
  const last = entries[entries.length - 1]
  if (first.used == null || last.used == null) return null
  const spanMs = Date.parse(last.ts) - Date.parse(first.ts)
  if (!Number.isFinite(spanMs) || spanMs <= 0) return null
  const usedDelta = last.used - first.used
  const perDay = usedDelta / (spanMs / (1000 * 60 * 60 * 24))
  if (perDay <= 0 || last.remaining == null) return { burnPerDay: 0, daysRemaining: null }
  return { burnPerDay: perDay, daysRemaining: last.remaining / perDay }
}

export default async function AdminScrapersPage() {
  const dataDir = await resolveDataDir()
  if (!dataDir) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-stone-900 mb-2">Scrapers</h1>
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Data directory not found. Expected at{' '}
          <code className="bg-amber-100 px-1 rounded">../trader/data</code> or{' '}
          <code className="bg-amber-100 px-1 rounded">apps/trader/data</code>. Run a scraper
          from <code className="bg-amber-100 px-1 rounded">apps/trader</code> to populate.
        </div>
      </main>
    )
  }

  const [platforms, quota] = await Promise.all([
    loadPlatformStats(dataDir),
    loadQuotaHistory(dataDir),
  ])

  const totalRowsToday = platforms.reduce((a, p) => a + p.latestRows, 0)
  const totalBytesAllTime = platforms.reduce((a, p) => a + p.totalBytesAllDays, 0)
  const runway = projectQuotaRunway(quota)
  const latestQuota = quota.length > 0 ? quota[quota.length - 1] : null

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Scrapers</h1>
        <p className="text-sm text-stone-600 mt-1">
          Live state of the scraper fleet. Reads the JSONL files from Albus's disk directly;
          no DB round-trip.
        </p>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Platforms tracking" value={String(platforms.filter((p) => p.latestFile).length)} sub={`${platforms.length} total directories`} />
        <MetricCard label="Rows today" value={totalRowsToday.toLocaleString()} sub="Latest file, all platforms" />
        <MetricCard label="Historical data" value={formatBytes(totalBytesAllTime)} sub="All JSONL files combined" />
        <MetricCard
          label="Odds API quota"
          value={latestQuota?.remaining?.toLocaleString() ?? '—'}
          sub={
            runway?.daysRemaining != null
              ? `~${runway.daysRemaining.toFixed(1)}d remaining at ${runway.burnPerDay.toFixed(0)}/day`
              : latestQuota
                ? `${latestQuota.used ?? 0} used so far`
                : 'No runs logged'
          }
          accent={runway?.daysRemaining != null && runway.daysRemaining < 3 ? 'amber' : 'default'}
        />
      </div>

      {/* Disabled-scraper banner */}
      {Object.keys(DISABLED_PLATFORMS).length > 0 && (
        <section>
          <div className="text-[10px] text-stone-400 tracking-wider mb-2">DISABLED · NEEDS FIX</div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
            {Object.entries(DISABLED_PLATFORMS).map(([name, meta]) => (
              <div key={name} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-amber-900 uppercase tracking-wide">
                    {name}
                  </span>
                  <span className="text-[10px] text-amber-700 tracking-wider">
                    DISABLED SINCE {meta.since}
                  </span>
                </div>
                <div className="text-xs text-amber-900/80 mt-1 leading-relaxed">
                  {meta.reason}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-platform table */}
      <section>
        <div className="text-[10px] text-stone-400 tracking-wider mb-2">PER-PLATFORM</div>
        <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2 text-[10px] text-stone-400 tracking-wider border-b border-stone-100 bg-stone-50">
            <div>PLATFORM</div>
            <div className="text-right">LATEST ROWS</div>
            <div className="text-right">LATEST SIZE</div>
            <div className="text-right">LAST WRITE</div>
            <div className="text-right">DAYS ON DISK</div>
            <div className="text-right">TOTAL SIZE</div>
          </div>
          {platforms.map((p) => {
            const disabled = DISABLED_PLATFORMS[p.platform]
            return (
              <div
                key={p.platform}
                className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-stone-100 last:border-b-0 items-center text-sm ${
                  disabled ? 'bg-amber-50/40' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-stone-900">{p.platform}</span>
                  {disabled && (
                    <span className="text-[9px] tracking-[0.15em] font-bold px-2 py-0.5 rounded-full ring-1 bg-amber-100 text-amber-800 ring-amber-300">
                      DISABLED
                    </span>
                  )}
                </div>
                <div className="text-right tabular-nums text-stone-700">
                  {p.latestFile ? p.latestRows.toLocaleString() : <span className="text-stone-400">—</span>}
                </div>
                <div className="text-right tabular-nums text-stone-700">
                  {p.latestFile ? formatBytes(p.latestBytes) : <span className="text-stone-400">—</span>}
                </div>
                <div className="text-right text-xs text-stone-500">{formatAge(p.latestMtime)}</div>
                <div className="text-right tabular-nums text-stone-700">{p.daysOnDisk}</div>
                <div className="text-right tabular-nums text-stone-600">{formatBytes(p.totalBytesAllDays)}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Odds API quota history */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[10px] text-stone-400 tracking-wider">ODDS API QUOTA HISTORY</div>
          <div className="text-[10px] text-stone-400 tracking-wider">
            {quota.length} RUN{quota.length === 1 ? '' : 'S'} LOGGED
          </div>
        </div>
        {quota.length === 0 ? (
          <div className="rounded border border-stone-200 bg-white p-6 text-sm text-stone-500 text-center">
            No Odds API runs logged yet. Run{' '}
            <code className="bg-stone-100 px-1 rounded text-xs">pnpm scrape:oddsapi</code> to populate.
          </div>
        ) : (
          <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
            <div className="grid grid-cols-[auto_auto_auto_auto_1fr] gap-4 px-4 py-2 text-[10px] text-stone-400 tracking-wider border-b border-stone-100 bg-stone-50">
              <div>TS</div>
              <div className="text-right">USED</div>
              <div className="text-right">REMAINING</div>
              <div className="text-right">SNAPSHOTS</div>
              <div className="text-right">AGE</div>
            </div>
            {quota
              .slice()
              .reverse()
              .slice(0, 20)
              .map((q, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[auto_auto_auto_auto_1fr] gap-4 px-4 py-2 border-b border-stone-100 last:border-b-0 text-xs"
                >
                  <div className="tabular-nums text-stone-700">
                    {new Date(q.ts).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="text-right tabular-nums text-stone-700">{q.used ?? '—'}</div>
                  <div className="text-right tabular-nums text-stone-700">{q.remaining ?? '—'}</div>
                  <div className="text-right tabular-nums text-stone-600">
                    {q.snapshots?.toLocaleString() ?? '—'}
                  </div>
                  <div className="text-right text-stone-500">{formatAge(q.ts)}</div>
                </div>
              ))}
            {quota.length > 20 && (
              <div className="px-4 py-2 text-[11px] text-stone-500 border-t border-stone-100">
                Showing most recent 20 of {quota.length} runs.
              </div>
            )}
          </div>
        )}
      </section>

      <div className="text-[11px] text-stone-500 pt-4 border-t border-stone-200">
        Scraper commands live in <code className="bg-stone-100 px-1 rounded">apps/trader/package.json</code>{' '}
        as <code className="bg-stone-100 px-1 rounded">pnpm scrape:&lt;platform&gt;</code>. When
        TimescaleDB is wired up (brief at{' '}
        <code className="bg-stone-100 px-1 rounded">~/Downloads/CLAUDE_CODE_BRIEF_timescaledb.md</code>),
        this page swaps the disk read for a SQL query.
      </div>
    </main>
  )
}

function MetricCard({
  label,
  value,
  sub,
  accent = 'default',
}: {
  label: string
  value: string
  sub?: string
  accent?: 'default' | 'amber'
}) {
  const accentCls =
    accent === 'amber'
      ? 'border-amber-300 bg-amber-50'
      : 'border-stone-200 bg-white'
  return (
    <div className={`rounded-lg border ${accentCls} p-4`}>
      <div className="text-[10px] text-stone-400 tracking-wider">{label.toUpperCase()}</div>
      <div className="text-2xl font-bold text-stone-900 tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-stone-500 mt-1">{sub}</div>}
    </div>
  )
}
