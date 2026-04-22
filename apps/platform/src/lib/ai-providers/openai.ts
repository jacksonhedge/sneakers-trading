import OpenAI from 'openai'
import type { ChatAdapter, ChatRequest, ChatResult } from './types'
import { ChatAdapterError } from './types'

/**
 * OpenAI adapter — works for gpt-4o, gpt-4o-mini, gpt-5.
 * Same `openai` npm package is used for the xAI adapter with a different
 * base URL (xAI exposes an OpenAI-compatible API).
 */
export const openaiAdapter: ChatAdapter = {
  provider: 'openai',
  async chat(req: ChatRequest): Promise<ChatResult> {
    return chatWithOpenAICompatible({ ...req, baseURL: undefined })
  },
}

export async function chatWithOpenAICompatible(
  req: ChatRequest & { baseURL?: string },
): Promise<ChatResult> {
  const client = new OpenAI({
    apiKey: req.apiKey,
    ...(req.baseURL ? { baseURL: req.baseURL } : {}),
  })

  // OpenAI-style chat completions: system prompt as first message, then the
  // conversation. We combine the stable system prompt and the fresh market
  // context into one system message. OpenAI doesn't have cheap prompt
  // caching like Anthropic — the full context is billed as input tokens
  // on every call.
  const systemContent = `${req.systemPrompt}\n\n---\n\n${req.marketContext}`
  try {
    const response = await client.chat.completions.create({
      model: req.modelId,
      max_completion_tokens: req.maxTokens ?? 2048,
      messages: [
        { role: 'system', content: systemContent },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    })

    const text = response.choices[0]?.message?.content ?? ''
    const usage = response.usage
    return {
      text,
      tokensInput: usage?.prompt_tokens ?? 0,
      tokensOutput: usage?.completion_tokens ?? 0,
    }
  } catch (err) {
    if (err instanceof OpenAI.RateLimitError) {
      throw new ChatAdapterError('OpenAI rate limit', 429, 'rate_limit')
    }
    if (err instanceof OpenAI.AuthenticationError) {
      throw new ChatAdapterError('OpenAI key rejected', 401, 'auth')
    }
    if (err instanceof OpenAI.APIError) {
      throw new ChatAdapterError(`OpenAI ${err.status}: ${err.message}`, err.status ?? 500)
    }
    throw err
  }
}
