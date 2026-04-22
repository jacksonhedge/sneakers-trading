import type { ChatAdapter, ChatRequest, ChatResult } from './types'
import { ChatAdapterError } from './types'

/**
 * Google Gemini adapter via fetch. Google's API is simple enough that
 * pulling in the @google/generative-ai SDK would be overkill for our
 * single-endpoint use case. Uses the v1beta models.generateContent API.
 *
 * https://ai.google.dev/gemini-api/docs/text-generation
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

type GeminiPart = { text: string }
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  error?: { code: number; message: string; status: string }
}

// Map our model ids to Gemini's actual endpoint model names.
const GEMINI_MODEL_MAP: Record<string, string> = {
  'gemini-2-5-flash': 'gemini-2.5-flash',
  'gemini-2-5-pro': 'gemini-2.5-pro',
}

export const googleAdapter: ChatAdapter = {
  provider: 'google',
  async chat(req: ChatRequest): Promise<ChatResult> {
    const geminiModel = GEMINI_MODEL_MAP[req.modelId] ?? req.modelId

    const contents: GeminiContent[] = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const systemInstruction = {
      parts: [{ text: `${req.systemPrompt}\n\n---\n\n${req.marketContext}` }],
    }

    const url = `${GEMINI_BASE}/${geminiModel}:generateContent?key=${encodeURIComponent(req.apiKey)}`
    const body = {
      contents,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 2048,
      },
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as GeminiResponse | null

    if (!res.ok || !data || data.error) {
      const msg = data?.error?.message ?? `Google API ${res.status}`
      throw new ChatAdapterError(msg, res.status, data?.error?.status)
    }

    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') ?? ''

    return {
      text,
      tokensInput: data.usageMetadata?.promptTokenCount ?? 0,
      tokensOutput: data.usageMetadata?.candidatesTokenCount ?? 0,
    }
  },
}
