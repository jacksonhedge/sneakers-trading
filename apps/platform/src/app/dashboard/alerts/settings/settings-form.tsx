'use client'

import { useEffect, useState, useTransition } from 'react'
import { ensurePushRegistered, requestPushPermission, unsubscribePush } from '@/lib/push/register'

interface Initial {
  email_enabled: boolean
  email_digest_mode: boolean
  push_enabled: boolean
  quiet_hours_start: number | null
  quiet_hours_end: number | null
  quiet_hours_tz: string
  push_subscription_count: number
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
] as const

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function formatHour(h: number): string {
  if (h === 0) return '12 am'
  if (h === 12) return '12 pm'
  if (h < 12) return `${h} am`
  return `${h - 12} pm`
}

export function SettingsForm({ initial }: { initial: Initial }) {
  const [emailEnabled, setEmailEnabled] = useState(initial.email_enabled)
  const [digestMode, setDigestMode] = useState(initial.email_digest_mode)
  const [pushEnabled, setPushEnabled] = useState(initial.push_enabled)
  const [tz, setTz] = useState(initial.quiet_hours_tz)
  const [quietEnabled, setQuietEnabled] = useState(
    initial.quiet_hours_start != null && initial.quiet_hours_end != null,
  )
  const [quietStart, setQuietStart] = useState<number>(initial.quiet_hours_start ?? 22)
  const [quietEnd, setQuietEnd] = useState<number>(initial.quiet_hours_end ?? 8)
  const [busy, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Push permission state — checked on mount.
  const [pushState, setPushState] = useState<'unknown' | 'granted' | 'default' | 'denied' | 'unsupported' | 'no_vapid'>(
    'unknown',
  )
  const [pushBusy, setPushBusy] = useState(false)
  const [subscriptionCount, setSubscriptionCount] = useState(initial.push_subscription_count)
  const [testStatus, setTestStatus] = useState<{ kind: 'idle' } | { kind: 'sending'; channel: string } | { kind: 'sent'; channel: string } | { kind: 'failed'; channel: string; error: string }>({ kind: 'idle' })

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushState('unsupported')
      return
    }
    if (!('serviceWorker' in navigator)) {
      setPushState('unsupported')
      return
    }
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      setPushState('no_vapid')
      return
    }
    const perm = Notification.permission
    setPushState(perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'default')
  }, [])

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/alerts/prefs', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email_enabled: emailEnabled,
          email_digest_mode: digestMode,
          push_enabled: pushEnabled,
          quiet_hours_tz: tz,
          quiet_hours_start: quietEnabled ? quietStart : null,
          quiet_hours_end: quietEnabled ? quietEnd : null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { message?: string }))
        setError(body.message ?? `Save failed (${res.status})`)
        return
      }
      setSavedAt(Date.now())
    })
  }

  async function enablePush() {
    setPushBusy(true)
    const result = await requestPushPermission()
    if (result.ok) {
      setPushState('granted')
      setSubscriptionCount((n) => n + 1)
    } else if (result.reason === 'permission_denied') {
      setPushState('denied')
    } else if (result.reason === 'unsupported') {
      setPushState('unsupported')
    } else {
      setError(result.error ?? `Push enable failed: ${result.reason}`)
    }
    setPushBusy(false)
  }

  async function reSubscribe() {
    setPushBusy(true)
    const result = await ensurePushRegistered()
    if (result.ok) {
      setSubscriptionCount((n) => Math.max(n, 1))
    }
    setPushBusy(false)
  }

  async function disablePush() {
    setPushBusy(true)
    await unsubscribePush()
    setSubscriptionCount(0)
    setPushBusy(false)
  }

  async function sendTest(channel: 'browser_push' | 'email') {
    setTestStatus({ kind: 'sending', channel })
    const res = await fetch('/api/alerts/test-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel }),
    })
    const body = await res.json().catch(() => ({} as { result?: Record<string, { success: boolean; reason?: string; error?: string }> }))
    if (!res.ok) {
      setTestStatus({ kind: 'failed', channel, error: `HTTP ${res.status}` })
      return
    }
    const channelResult = body.result?.[channel]
    if (channelResult?.success) {
      setTestStatus({ kind: 'sent', channel })
    } else {
      setTestStatus({
        kind: 'failed',
        channel,
        error: channelResult?.reason ?? channelResult?.error ?? 'Unknown failure',
      })
    }
    setTimeout(() => setTestStatus({ kind: 'idle' }), 6000)
  }

  const isiOSSafari =
    typeof window !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(navigator as Navigator & { standalone?: boolean }).standalone

  return (
    <div className="space-y-6">
      {/* Browser push */}
      <Section title="Browser push">
        {pushState === 'unsupported' && (
          <p className="text-sm text-stone-600">
            Your browser doesn&apos;t support Web Push. Email still works.
          </p>
        )}
        {pushState === 'no_vapid' && (
          <p className="text-sm text-stone-600">
            Push is not configured on the server. Ask the admin to set <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>.
          </p>
        )}
        {pushState === 'denied' && (
          <p className="text-sm text-amber-700">
            You blocked notifications in your browser. Re-enable them in your browser&apos;s site
            settings (lock icon in the address bar), then come back.
          </p>
        )}
        {(pushState === 'default' || pushState === 'granted') && (
          <div className="space-y-3">
            <p className="text-sm text-stone-600">
              {pushState === 'granted'
                ? `${subscriptionCount} device${subscriptionCount === 1 ? '' : 's'} subscribed.`
                : 'Click below to enable browser notifications. We use it for alert deliveries only — never marketing.'}
            </p>
            {isiOSSafari && (
              <div className="text-xs text-stone-500 rounded border border-stone-200 bg-stone-50 p-2">
                iOS Safari requires Sneakers Terminal to be installed via &quot;Add to Home Screen&quot;
                before push notifications work.
              </div>
            )}
            <div className="flex items-center gap-2">
              {pushState === 'default' && (
                <button
                  type="button"
                  onClick={enablePush}
                  disabled={pushBusy}
                  className="text-xs tracking-wider font-semibold px-3 py-2 rounded bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  ENABLE BROWSER PUSH
                </button>
              )}
              {pushState === 'granted' && subscriptionCount === 0 && (
                <button
                  type="button"
                  onClick={reSubscribe}
                  disabled={pushBusy}
                  className="text-xs tracking-wider font-semibold px-3 py-2 rounded bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  RE-SUBSCRIBE THIS DEVICE
                </button>
              )}
              {pushState === 'granted' && subscriptionCount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => sendTest('browser_push')}
                    disabled={pushBusy || testStatus.kind === 'sending'}
                    className="text-xs tracking-wider font-semibold px-3 py-2 rounded border border-stone-300 hover:bg-stone-50 disabled:opacity-50"
                  >
                    SEND TEST PUSH
                  </button>
                  <button
                    type="button"
                    onClick={disablePush}
                    disabled={pushBusy}
                    className="text-xs tracking-wider text-stone-500 hover:text-stone-900"
                  >
                    DISABLE THIS DEVICE
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <Toggle
          label="Use browser push (master switch)"
          checked={pushEnabled}
          onChange={setPushEnabled}
        />
      </Section>

      {/* Email */}
      <Section title="Email">
        <Toggle label="Email me alert fires" checked={emailEnabled} onChange={setEmailEnabled} />
        <Toggle
          label="Batch into a digest (preference saved; v1 still sends one email per fire)"
          checked={digestMode}
          onChange={setDigestMode}
        />
        <button
          type="button"
          onClick={() => sendTest('email')}
          disabled={testStatus.kind === 'sending'}
          className="text-xs tracking-wider font-semibold px-3 py-2 rounded border border-stone-300 hover:bg-stone-50 disabled:opacity-50"
        >
          SEND TEST EMAIL
        </button>
      </Section>

      {/* Quiet hours */}
      <Section title="Quiet hours">
        <Toggle label="Enable quiet hours" checked={quietEnabled} onChange={setQuietEnabled} />
        {quietEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Start hour">
              <select
                value={quietStart}
                onChange={(e) => setQuietStart(parseInt(e.target.value, 10))}
                className={inputCls}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="End hour">
              <select
                value={quietEnd}
                onChange={(e) => setQuietEnd(parseInt(e.target.value, 10))}
                className={inputCls}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Timezone">
              <select value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
                {TIMEZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Section>

      {/* Test feedback */}
      {testStatus.kind === 'sending' && (
        <div className="rounded border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-700">
          Sending test {testStatus.channel === 'email' ? 'email' : 'push'}…
        </div>
      )}
      {testStatus.kind === 'sent' && (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          ✓ Test {testStatus.channel === 'email' ? 'email' : 'push'} sent.{' '}
          {testStatus.channel === 'email' ? 'Check your inbox.' : 'Check your notifications.'}
        </div>
      )}
      {testStatus.kind === 'failed' && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          Test {testStatus.channel === 'email' ? 'email' : 'push'} failed: {testStatus.error}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {savedAt && (
          <span className="text-xs text-emerald-700">
            ✓ Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="text-xs tracking-wider font-semibold px-4 py-2 rounded bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {busy ? 'SAVING…' : 'SAVE PREFERENCES'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-stone-200 bg-white p-5 space-y-3">
      <div className="text-xs text-[#004225] tracking-wider font-semibold">{'>'} {title.toUpperCase()}</div>
      {children}
    </section>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer text-sm">
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-emerald-600' : 'bg-stone-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className="text-stone-700">{label}</span>
    </label>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs tracking-wider font-semibold text-stone-700 block mb-1">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'block w-full rounded border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500'
