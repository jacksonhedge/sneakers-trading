'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AlertRule, Channel, MarketFilter, TriggerType } from '@/lib/alerts/types'

// Shared rule builder. Used by /dashboard/alerts/new (no `existing` prop)
// and /dashboard/alerts/[id]/edit (existing supplied).

const TRIGGER_OPTIONS: Array<{ value: TriggerType; label: string; help: string }> = [
  { value: 'price_threshold', label: 'Price threshold', help: 'When probability crosses a level.' },
  { value: 'price_movement', label: 'Price movement', help: 'When probability moves N pp in a window.' },
  { value: 'overround_threshold', label: 'Overround', help: 'When the book widens or tightens past a level.' },
  { value: 'arb_appearance', label: 'Cross-book arb', help: 'When the same game prices into an arb across books.' },
]

const PLATFORMS = ['polymarket', 'kalshi', 'novig', 'prophetx', 'og', 'fanduel', 'draftkings', 'betmgm'] as const
const SPORTS = ['basketball', 'football', 'baseball', 'hockey', 'soccer', 'mma', 'boxing'] as const
const CATEGORIES = ['politics', 'economics', 'crypto', 'sports', 'tech', 'other'] as const
const WINDOW_OPTS: Array<{ value: number; label: string }> = [
  { value: 5, label: '5m' },
  { value: 15, label: '15m' },
  { value: 60, label: '1h' },
  { value: 360, label: '6h' },
  { value: 1440, label: '24h' },
  { value: 10080, label: '7d' },
]
const COOLDOWN_OPTS: Array<{ value: number; label: string }> = [
  { value: 10, label: '10 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '1 day' },
]

interface Props {
  existing?: AlertRule | null
  pushAvailable: boolean
}

export function RuleForm({ existing, pushAvailable }: Props) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [preview, setPreview] = useState<{
    matching_markets_now: number
    would_have_fired: number
    sample_fires: Array<{ at: string; market_key: string }>
  } | null>(null)

  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [triggerType, setTriggerType] = useState<TriggerType>(existing?.trigger_type ?? 'price_threshold')
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(
    (existing?.trigger_config as Record<string, unknown>) ?? defaultConfigFor('price_threshold'),
  )
  const [filter, setFilter] = useState<MarketFilter>((existing?.market_filter as MarketFilter) ?? { sport: 'basketball' })
  const [channels, setChannels] = useState<Channel[]>(existing?.channels ?? ['browser_push', 'email'])
  const [cooldown, setCooldown] = useState<number>(existing?.cooldown_minutes ?? 60)
  const [enabled, setEnabled] = useState<boolean>(existing?.enabled ?? true)

  // When trigger type changes, reset the config to that type's defaults
  // unless we're editing an existing rule with a matching type.
  useEffect(() => {
    if (existing && existing.trigger_type === triggerType) return
    setTriggerConfig(defaultConfigFor(triggerType))
  }, [triggerType, existing])

  function toggleChannel(c: Channel) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  function updateFilter(field: keyof MarketFilter, value: string) {
    setFilter((prev) => {
      const next = { ...prev }
      if (value === '') {
        delete next[field]
      } else {
        next[field] = value
      }
      return next
    })
  }

  async function runPreview() {
    setPreviewBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/alerts/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          market_filter: filter,
          cooldown_minutes: cooldown,
        }),
      })
      const body = await res.json().catch(() => ({} as { error?: string; message?: string }))
      if (!res.ok) {
        setError(body.message ?? body.error ?? `Preview failed (${res.status})`)
        return
      }
      setPreview(body)
    } finally {
      setPreviewBusy(false)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: triggerType,
        trigger_config: triggerConfig,
        market_filter: filter,
        channels,
        cooldown_minutes: cooldown,
        enabled,
      }
      const url = existing ? `/api/alerts/rules/${existing.id}` : '/api/alerts/rules'
      const method = existing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({} as { error?: string; message?: string; field?: string }))
      if (!res.ok) {
        setError(
          body.message ??
            (body.field ? `${body.field}: ${body.error}` : body.error) ??
            `Save failed (${res.status})`,
        )
        return
      }
      router.push('/dashboard/alerts')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Name + description */}
      <Section title="Basics">
        <Field label="Name *" htmlFor="rule-name">
          <input
            id="rule-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. NBA favorites near 90%"
            className={inputCls}
          />
        </Field>
        <Field label="Description" htmlFor="rule-desc">
          <textarea
            id="rule-desc"
            rows={2}
            value={description ?? ''}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this rule is for (visible only to you)."
            className={inputCls}
          />
        </Field>
      </Section>

      {/* Trigger */}
      <Section title="Trigger">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {TRIGGER_OPTIONS.map((opt) => {
            const active = triggerType === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTriggerType(opt.value)}
                className={`text-left rounded border p-3 transition ${
                  active
                    ? 'border-emerald-500 ring-1 ring-emerald-200 bg-emerald-50'
                    : 'border-stone-200 bg-white hover:border-stone-300'
                }`}
              >
                <div className="text-sm font-semibold text-stone-900">{opt.label}</div>
                <div className="text-[11px] text-stone-500 mt-0.5">{opt.help}</div>
              </button>
            )
          })}
        </div>

        <TriggerConfigFields type={triggerType} config={triggerConfig} setConfig={setTriggerConfig} />
      </Section>

      {/* Market filter */}
      <Section title="Market filter">
        <p className="text-xs text-stone-500 mb-3">
          AND-composed. At least one filter required to keep fire rates sane.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Platform">
            <select
              value={filter.platform ?? ''}
              onChange={(e) => updateFilter('platform', e.target.value)}
              className={inputCls}
            >
              <option value="">— any —</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sport">
            <select
              value={filter.sport ?? ''}
              onChange={(e) => updateFilter('sport', e.target.value)}
              className={inputCls}
            >
              <option value="">— any —</option>
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select
              value={filter.category ?? ''}
              onChange={(e) => updateFilter('category', e.target.value)}
              className={inputCls}
            >
              <option value="">— any —</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Pin to specific market (optional)">
          <input
            type="text"
            value={filter.market_key ?? ''}
            onChange={(e) => updateFilter('market_key', e.target.value)}
            placeholder="e.g. kalshi:KXNBA-LAKBOS-LAK"
            className={`${inputCls} font-mono text-xs`}
          />
        </Field>
      </Section>

      {/* Channels + cooldown */}
      <Section title="Delivery">
        <Field label="Channels">
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={channels.includes('browser_push')}
                onChange={() => toggleChannel('browser_push')}
                disabled={!pushAvailable}
              />
              <span>
                Browser push
                {!pushAvailable && (
                  <span className="text-[11px] text-stone-400 ml-2">
                    (enable on the settings page first)
                  </span>
                )}
              </span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={channels.includes('email')}
                onChange={() => toggleChannel('email')}
              />
              <span>Email</span>
            </label>
          </div>
        </Field>
        <Field label="Cooldown" htmlFor="rule-cooldown">
          <select
            id="rule-cooldown"
            value={cooldown}
            onChange={(e) => setCooldown(parseInt(e.target.value, 10))}
            className={inputCls}
          >
            {COOLDOWN_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Enabled">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Rule is active</span>
          </label>
        </Field>
      </Section>

      {/* Preview */}
      <Section title="Preview">
        <button
          type="button"
          onClick={runPreview}
          disabled={previewBusy}
          className="text-xs tracking-wider font-semibold px-3 py-2 rounded border border-stone-300 hover:bg-stone-50 disabled:opacity-50"
        >
          {previewBusy ? 'COMPUTING…' : 'PREVIEW (LAST 7 DAYS)'}
        </button>
        {preview && (
          <div className="mt-3 rounded border border-stone-200 bg-white p-4 space-y-2">
            <div className="text-sm">
              Matches{' '}
              <span className="font-semibold tabular-nums">{preview.matching_markets_now}</span>{' '}
              market{preview.matching_markets_now === 1 ? '' : 's'} right now.
            </div>
            <div className="text-sm">
              Would have fired{' '}
              <span className="font-semibold tabular-nums">{preview.would_have_fired}</span>{' '}
              time{preview.would_have_fired === 1 ? '' : 's'} in the last 7 days (with this cooldown).
            </div>
            {preview.sample_fires.length > 0 && (
              <div className="text-xs text-stone-500 mt-2">
                Sample fires:
                <ul className="mt-1 space-y-0.5 font-mono">
                  {preview.sample_fires.map((f) => (
                    <li key={f.at}>
                      {f.at.replace('T', ' ').slice(0, 16)} — {f.market_key}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Section>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 text-red-800 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push('/dashboard/alerts')}
          className="text-xs tracking-wider font-semibold px-4 py-2 text-stone-600 hover:text-stone-900"
        >
          CANCEL
        </button>
        <button
          type="submit"
          disabled={busy}
          className="text-xs tracking-wider font-semibold px-4 py-2 rounded bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {busy ? 'SAVING…' : existing ? 'SAVE CHANGES' : 'CREATE RULE'}
        </button>
      </div>
    </form>
  )
}

function TriggerConfigFields({
  type,
  config,
  setConfig,
}: {
  type: TriggerType
  config: Record<string, unknown>
  setConfig: (c: Record<string, unknown>) => void
}) {
  function set<K extends string>(key: K, value: unknown) {
    setConfig({ ...config, [key]: value })
  }

  switch (type) {
    case 'price_threshold':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Direction">
            <select
              value={(config.direction as string) ?? 'above'}
              onChange={(e) => set('direction', e.target.value)}
              className={inputCls}
            >
              <option value="above">Crosses above</option>
              <option value="below">Crosses below</option>
            </select>
          </Field>
          <Field label="Threshold (probability)">
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={(config.threshold as number) ?? 0.9}
              onChange={(e) => set('threshold', Number(e.target.value))}
              className={inputCls}
            />
            <div className="text-[11px] text-stone-500 mt-1">
              {((Number(config.threshold) || 0) * 100).toFixed(0)}%
            </div>
          </Field>
        </div>
      )
    case 'price_movement':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Movement (percentage points)">
            <input
              type="number"
              min={5}
              max={90}
              step={1}
              value={(config.delta_pp as number) ?? 20}
              onChange={(e) => set('delta_pp', Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Window">
            <select
              value={(config.window_minutes as number) ?? 60}
              onChange={(e) => set('window_minutes', parseInt(e.target.value, 10))}
              className={inputCls}
            >
              {WINDOW_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )
    case 'overround_threshold':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Direction">
            <select
              value={(config.direction as string) ?? 'above'}
              onChange={(e) => set('direction', e.target.value)}
              className={inputCls}
            >
              <option value="above">Widens above</option>
              <option value="below">Tightens below</option>
            </select>
          </Field>
          <Field label="Overround threshold">
            <input
              type="number"
              min={0.5}
              max={2}
              step={0.01}
              value={(config.threshold as number) ?? 1.05}
              onChange={(e) => set('threshold', Number(e.target.value))}
              className={inputCls}
            />
            <div className="text-[11px] text-stone-500 mt-1">
              1.00 = perfect book; &gt;1.05 = wide
            </div>
          </Field>
        </div>
      )
    case 'arb_appearance':
      return (
        <Field label="Minimum edge (percentage points, optional)">
          <input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={(config.min_edge_pp as number | undefined) ?? 0}
            onChange={(e) => set('min_edge_pp', Number(e.target.value))}
            className={inputCls}
          />
          <div className="text-[11px] text-stone-500 mt-1">
            0 = any positive-edge cross-book pair fires.
          </div>
        </Field>
      )
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-stone-200 bg-white p-5">
      <div className="text-xs text-[#004225] tracking-wider mb-4 font-semibold">{'>'} {title.toUpperCase()}</div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="text-xs tracking-wider font-semibold text-stone-700 block mb-1">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'block w-full rounded border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500'

function defaultConfigFor(t: TriggerType): Record<string, unknown> {
  switch (t) {
    case 'price_threshold':
      return { direction: 'above', threshold: 0.9 }
    case 'price_movement':
      return { delta_pp: 20, window_minutes: 60 }
    case 'overround_threshold':
      return { direction: 'above', threshold: 1.05 }
    case 'arb_appearance':
      return { min_edge_pp: 0 }
  }
}
