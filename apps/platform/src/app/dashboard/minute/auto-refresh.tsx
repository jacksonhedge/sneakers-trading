'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Triggers a server-component re-render every `intervalMs` via router.refresh().
// Replaces <meta http-equiv="refresh"> which would steal in-flight clicks
// (notably the asset filter buttons — clicking "all" while on ?asset=BTC
// could race the meta reload and stay on BTC). router.refresh() preserves
// the URL, scroll position, and any in-flight navigation.
//
// Pauses while the tab is hidden so we don't burn DB queries on backgrounded
// tabs. Resumes immediately on visibility change.
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
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
