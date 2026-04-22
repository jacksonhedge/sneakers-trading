import { requireAdmin } from '@/lib/admin-auth'
import { AdminNav } from './nav'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { email } = await requireAdmin()
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <AdminNav email={email} />
      <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
    </div>
  )
}
