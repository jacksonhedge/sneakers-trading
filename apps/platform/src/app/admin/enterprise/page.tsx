import { PendingStub } from '../pending-stub'

export const dynamic = 'force-dynamic'

export default function AdminEnterprisePage() {
  return (
    <PendingStub
      title="Enterprise — Sales pipeline + quotes"
      brief="docs/HANDOFF_STRIPE_SUBSCRIPTIONS.md (enterprise_inquiries table)"
      eventualFeatures={[
        'Enterprise inquiries table (status=new / contacted / qualified / negotiating / won / lost)',
        'Assign-to admin (for multi-rep handoff)',
        'Notes field + quoted_amount_usd + closed_at on close',
        'Pipeline kanban view — drag between status columns',
        'Funnel conversion stats: new → contacted → qualified → won rate',
        'Mac Studio / MacBook hardware-bundle calculator (Apple MSRP + markup)',
        'Recurring-software-fee projection for each prospect',
        'Export to CRM (CSV or JSON) for sales ops integrations',
      ]}
    />
  )
}
