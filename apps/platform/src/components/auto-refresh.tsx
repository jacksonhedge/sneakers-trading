'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Triggers a server-component re-render every `intervalMs` via router.refresh().
// Replaces any <meta http-equiv="refresh"> approach which would steal
// in-flight clicks. router.refresh() preserves the URL, scroll position,
// and any in-flight navigation, and re-fetches data via the App Router's
// streaming pipeline so prices/markets update without a full page nav.
//
// Pauses while the tab is hidden so we don't burn DB queries on
// backgrounded tabs. Resumes immediately on visibility change.
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter()
  const [paused, setPaused] = useState(false)
  const lastRef = useRef<number>(Date.now())

  useEffect(() => {
    const onVis = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      lastRef.current = Date.now()
      router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [paused, intervalMs, router])

  return null
}
