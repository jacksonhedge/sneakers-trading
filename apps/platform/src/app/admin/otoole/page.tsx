import { PendingStub } from '../pending-stub'

export const dynamic = 'force-dynamic'

export default function AdminOTooleCostsPage() {
  return (
    <PendingStub
      title="O'Toole AI — Cost telemetry + usage"
      brief="docs/HANDOFF_STRIPE_SUBSCRIPTIONS.md (Phase 8e)"
      eventualFeatures={[
        'Last-30-days total queries, total cost (Anthropic tokens + enrichment APIs)',
        'Cost per tier (Free / Pro / Elite / Business / Fraternity)',
        'Top 20 spenders over window — spot abusers or power users early',
        'Alert banner when monthly AI cost > 50% of monthly AI-subscription revenue (OTOOLE_COST_ALERT_PCT env var)',
        'Per-user query-by-query log for debugging abuse or unusual patterns',
        'CSV export for accounting / finance',
        'Enrichment-call breakdown (weather / news / injury) per tier',
      ]}
    />
  )
}
