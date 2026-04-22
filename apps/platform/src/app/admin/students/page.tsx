import { PendingStub } from '../pending-stub'

export const dynamic = 'force-dynamic'

export default function AdminStudentsPage() {
  return (
    <PendingStub
      title="Students — 75% discount verification queue"
      brief="docs/HANDOFF_STRIPE_SUBSCRIPTIONS.md (Phase 9)"
      eventualFeatures={[
        'Pending verifications queue (status = pending) with pagination',
        'Each row shows .edu email, Instagram handle, LinkedIn URL, declared grad year',
        'Quick-link buttons to open Instagram / LinkedIn profiles in new tabs for spot-check',
        'Approve button — sets status=approved, verified_at, verified_by; derives expires_at from grad_year',
        'Reject button — reason dropdown (not a student / fake profile / already graduated / other)',
        'Fraud signals: >5 submissions from same university/day auto-flags for review',
        'Annual re-verification queue (status=pending_reverification based on expires_at cron)',
        'Historical stats: total approved / rejected / active student subscriptions',
      ]}
    />
  )
}
