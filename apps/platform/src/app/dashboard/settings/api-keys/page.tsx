import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-auth'
import { listUserProviderKeys } from '@/lib/provider-keys'
import { AI_MODELS, type AIProvider } from '@/lib/ai-models'
import { ApiKeysEditor } from './api-keys-editor'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'API keys — Sneakers Terminal',
}

const PROVIDER_META: Record<AIProvider, {
  name: string
  keyFormat: string
  getKeyUrl: string
  note: string
}> = {
  anthropic: {
    name: 'Anthropic',
    keyFormat: 'starts with sk-ant-',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Unlocks Claude Haiku / Sonnet / Opus without spending Sneakers credits.',
  },
  openai: {
    name: 'OpenAI',
    keyFormat: 'starts with sk-',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    note: 'Unlocks GPT-4o mini / 4o / 5 without spending Sneakers credits.',
  },
  google: {
    name: 'Google AI',
    keyFormat: 'starts with AIza',
    getKeyUrl: 'https://aistudio.google.com/apikey',
    note: 'Unlocks Gemini 2.5 Flash / Pro without spending Sneakers credits.',
  },
  xai: {
    name: 'xAI',
    keyFormat: 'starts with xai-',
    getKeyUrl: 'https://console.x.ai/team',
    note: 'Unlocks Grok 3 without spending Sneakers credits.',
  },
}

export default async function ApiKeysPage() {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/settings/api-keys')

  const existing = await listUserProviderKeys(user.id)
  const byProvider = Object.fromEntries(existing.map((e) => [e.provider, e]))

  const providers: AIProvider[] = ['anthropic', 'openai', 'google', 'xai']

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link
          href="/dashboard"
          className="text-xs text-[#004225]/80 tracking-wider hover:text-[#004225]"
        >
          ← DASHBOARD
        </Link>

        <header className="mt-6 mb-8">
          <div className="text-xs text-[#004225] tracking-wider mb-1">{'>'} SETTINGS · API KEYS</div>
          <h1 className="text-3xl md:text-4xl font-bold">Bring your own keys</h1>
          <p className="text-sm text-stone-600 mt-2 max-w-2xl">
            Add your own API key for any provider. When you use a model whose
            provider has a BYO key, Sneakers uses your key and skips the credit
            charge — you pay the provider directly. Smart move if you&apos;re a
            heavy O&apos;Toole user and already have provider accounts.
          </p>
          <div className="mt-4 rounded bg-amber-50 ring-1 ring-amber-200 text-amber-900 text-xs px-4 py-3 max-w-2xl">
            <strong>Security:</strong> keys are encrypted at rest and never
            sent back to your browser after save. Still — only
            paste keys scoped to Anthropic/OpenAI/etc. with rate limits you&apos;re
            comfortable losing if your account is compromised. You can delete
            keys any time.
          </div>
        </header>

        <div className="space-y-4">
          {providers.map((provider) => {
            const meta = PROVIDER_META[provider]
            const existingKey = byProvider[provider]
            const modelsForProvider = AI_MODELS.filter((m) => m.provider === provider)
            return (
              <ApiKeysEditor
                key={provider}
                provider={provider}
                name={meta.name}
                keyFormat={meta.keyFormat}
                getKeyUrl={meta.getKeyUrl}
                note={meta.note}
                modelNames={modelsForProvider.map((m) => m.displayName)}
                existing={
                  existingKey
                    ? {
                        keyPreview: existingKey.keyPreview,
                        verifiedAt: existingKey.verifiedAt,
                        lastUsedAt: existingKey.lastUsedAt,
                        label: existingKey.label,
                      }
                    : null
                }
              />
            )
          })}
        </div>

        <footer className="mt-10 text-xs text-stone-500 max-w-2xl">
          Questions about BYO? See{' '}
          <a href="mailto:support@sneakersterminal.com" className="underline hover:text-stone-700">
            support
          </a>{' '}
          or read the{' '}
          <a href="/dashboard/billing/credits" className="underline hover:text-stone-700">
            credits page
          </a>{' '}
          to compare cost models.
        </footer>
      </div>
    </main>
  )
}
