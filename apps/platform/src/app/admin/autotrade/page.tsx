import { PendingStub } from '../pending-stub'

export const dynamic = 'force-dynamic'

export default function AdminAutoTradePage() {
  return (
    <PendingStub
      title="Auto-Trade — Volumes, failures, kill switches"
      brief="docs/HANDOFF_AUTOTRADE.md"
      eventualFeatures={[
        'Total auto-trade volume today / this week / this month (live vs dry-run)',
        'Per-user top spenders + per-user daily volume vs cap',
        'Recent failures (status = error / rejected) with full Polymarket response',
        'Circuit-breaker events log — every time the auto-disable tripped',
        'Manual "Disable auto-trade for user X" emergency action',
        'Global kill-switch flip (requires typing CONFIRM KILL to execute)',
        'Active rule count per tier with Fraternity-excluded callout',
        'Per-venue breakdown (Polymarket v1; Kalshi/ProphetX when added)',
      ]}
    />
  )
}
