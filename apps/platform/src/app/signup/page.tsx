import Image from 'next/image'
import Link from 'next/link'
import { SignupForm } from './signup-form'
import { isValidInviteCodeFormat } from '@/lib/invite-code'

export const dynamic = 'force-dynamic'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const sp = await searchParams
  const rawCode = sp.code?.toUpperCase()
  const initialCode = rawCode && isValidInviteCodeFormat(rawCode) ? rawCode : undefined

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="flex flex-col items-center">
          <div className="text-xs text-[#004225]/60 mb-6 tracking-wider">
            SNEAKERS TERMINAL / ACCESS
          </div>
          <Image
            src="/logo.png"
            alt="Sneakers"
            width={200}
            height={200}
            priority
            className="mb-4 mix-blend-multiply"
          />
          <h1 className="sr-only">Sneakers — sign up</h1>
          <div className="text-[#00703c] text-xl md:text-2xl font-semibold">
            Lace &apos;Em Up.
          </div>
          <div className="mt-2 text-stone-700 italic">
            Enter your access code to get in.
          </div>
        </div>

        <SignupForm initialCode={initialCode} />

        <div className="text-xs text-stone-500 pt-8">
          Don&apos;t have a code yet?{' '}
          <Link href="/" className="text-[#00703c] hover:underline">
            Join the waitlist
          </Link>
          .
        </div>
      </div>
    </main>
  )
}
