import { TerminalLoadingSplash } from '@/components/terminal-loading-splash'

// Loading slot for /dashboard and any /dashboard/* page that doesn't
// declare its own loading.tsx. The dashboard layout's chrome (topbar +
// OToole panel) wraps this; the splash fills the right-hand main slot.

export default function DashboardLoading() {
  return <TerminalLoadingSplash />
}
