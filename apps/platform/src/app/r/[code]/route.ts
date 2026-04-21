import { NextResponse } from 'next/server'
import { isValidReferralCodeFormat } from '@/lib/referral-code'

const COOKIE_NAME = 'sneakers_ref'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params
  const normalized = (code ?? '').toUpperCase()

  const url = new URL('/', req.url)
  const res = NextResponse.redirect(url, 302)

  if (isValidReferralCodeFormat(normalized)) {
    res.cookies.set(COOKIE_NAME, normalized, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: false, // needs to be readable by server components; not sensitive
      sameSite: 'lax',
      path: '/',
      secure: true,
    })
  }
  return res
}
