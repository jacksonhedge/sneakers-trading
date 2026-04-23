export const ONBOARDING_STEPS = [
  { slug: 'about-you', label: 'About you' },
  { slug: 'platforms', label: 'Platforms' },
  { slug: 'invite-friends', label: 'Invite friends' },
  { slug: 'location-check', label: 'Location' },
  { slug: 'done', label: 'Done' },
] as const

export type OnboardingStepSlug = (typeof ONBOARDING_STEPS)[number]['slug']

export function stepIndex(slug: OnboardingStepSlug): number {
  return ONBOARDING_STEPS.findIndex((s) => s.slug === slug)
}

export function nextStepSlug(slug: OnboardingStepSlug): OnboardingStepSlug | null {
  const i = stepIndex(slug)
  if (i === -1 || i >= ONBOARDING_STEPS.length - 1) return null
  return ONBOARDING_STEPS[i + 1].slug
}
