import { PendingStub } from '../pending-stub'

export const dynamic = 'force-dynamic'

export default function AdminAlertsPage() {
  return (
    <PendingStub
      title="Alerts — Fire rates + delivery"
      brief="docs/HANDOFF_NOTIFICATIONS.md"
      eventualFeatures={[
        'Total rules across all users, breakdown by trigger_type',
        'Fire rate over last 24h / 7d, with per-rule top-firers',
        'Per-channel delivery success rate (browser_push vs email)',
        'Failed deliveries log with full error payload (Resend 5xx, push endpoint 410, etc.)',
        'Abuse detection — users with >1,000 fires/day flagged automatically',
        'Drill into any alert_events row to inspect the trigger_snapshot',
        'Manual "Disable user X\'s alerts" action for admin emergencies',
      ]}
    />
  )
}
