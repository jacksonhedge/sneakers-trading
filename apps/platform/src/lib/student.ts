import { getServerClient } from './supabase-server'

// Helpers for the student-discount flow. The schema lives in
// migration 010_student_verification.sql. Domain allowlist is in
// lib/student/edu-domains.ts.

export type StudentStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'pending_reverification'

export interface StudentVerificationRow {
  id: string
  waitlistUserId: string
  eduEmail: string
  instagramHandle: string
  linkedinUrl: string
  universityName: string | null
  universityDomain: string | null
  gradYear: number
  status: 'pending' | 'approved' | 'rejected' | 'pending_reverification'
  submittedAt: string
  verifiedAt: string | null
  verifiedBy: string | null
  rejectionReason: string | null
  expiresAt: string | null
}

/**
 * Look up by waitlist user id. Returns 'none' if no row exists, the row
 * status otherwise. Doesn't check expires_at — getApprovedStudent does
 * that.
 */
export async function getVerificationStatus(userId: string): Promise<StudentStatus> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('student_verification')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[student] getVerificationStatus failed', error)
    return 'none'
  }
  if (!data) return 'none'
  return data.status as StudentStatus
}

/**
 * Returns the verification row only if it is currently approved AND not
 * past expires_at. This is the gate that /api/stripe/checkout uses to
 * decide whether to attach the STUDENT75 coupon.
 */
export async function getApprovedStudent(
  waitlistUserId: string,
): Promise<StudentVerificationRow | null> {
  const row = await getVerificationByWaitlistId(waitlistUserId)
  if (!row || row.status !== 'approved') return null
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    return null
  }
  return row
}

export async function getVerificationByWaitlistId(
  waitlistUserId: string,
): Promise<StudentVerificationRow | null> {
  const sb = getServerClient()
  const { data, error } = await sb
    .from('student_verification')
    .select('*')
    .eq('waitlist_user_id', waitlistUserId)
    .maybeSingle()
  if (error) {
    console.error('[student] lookup failed', error)
    return null
  }
  if (!data) return null
  return rowToCamel(data as Record<string, unknown>)
}

/**
 * Derive expires_at from declared graduation year. Discount lapses on
 * June 30 of grad_year + 30-day slack (lets a recent grad keep using
 * the discount through the summer they graduate).
 */
export function deriveExpiresAt(gradYear: number): string {
  // June 30 (0-indexed month = 5) + 30 days = ~July 30.
  const expiry = new Date(Date.UTC(gradYear, 6, 30))
  return expiry.toISOString()
}

/**
 * Normalize a submitted Instagram handle: strip leading @ and any
 * accidental URL prefix, lowercase. Keeps only [a-z0-9._].
 */
export function normalizeInstagramHandle(input: string): string | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
  if (!/^[a-z0-9._]{1,30}$/.test(cleaned)) return null
  return cleaned
}

/**
 * Loose validation that a string smells like a LinkedIn profile URL.
 * We don't fetch and verify — admin eyeballs.
 */
export function isLinkedInUrl(input: string): boolean {
  const trimmed = input.trim().toLowerCase()
  if (trimmed.length > 500) return false
  return /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/.+/.test(trimmed)
}

function rowToCamel(r: Record<string, unknown>): StudentVerificationRow {
  return {
    id: r.id as string,
    waitlistUserId: r.waitlist_user_id as string,
    eduEmail: r.edu_email as string,
    instagramHandle: r.instagram_handle as string,
    linkedinUrl: r.linkedin_url as string,
    universityName: (r.university_name as string | null) ?? null,
    universityDomain: (r.university_domain as string | null) ?? null,
    gradYear: r.grad_year as number,
    status: r.status as StudentVerificationRow['status'],
    submittedAt: r.submitted_at as string,
    verifiedAt: (r.verified_at as string | null) ?? null,
    verifiedBy: (r.verified_by as string | null) ?? null,
    rejectionReason: (r.rejection_reason as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
  }
}
