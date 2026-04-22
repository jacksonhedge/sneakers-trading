import Anthropic from '@anthropic-ai/sdk'
import type { ChatAdapter, ChatRequest, ChatResult } from './types'
import { ChatAdapterError } from './types'

/**
 * Anthropic adapter — the original Claude-via-SDK path. Uses prompt caching
 * on the system prompt + market context (Anthropic's cache is the unit-
 * economics lever; other providers don't match it).
 */
export const anthropicAdapter: ChatAdapter = {
  provider: 'anthropic',
  async chat(req: ChatRequest): Promise<ChatResult> {
    const client = new Anthropic({ apiKey: req.apiKey })
    try {
      const response = await client.messages.create({
        model: req.modelId,
        max_tokens: req.maxTokens ?? 2048,
        system: [
          { type: 'text', text: req.systemPrompt },
          { type: 'text', text: req.marketContext, cache_control: { type: 'ephemeral' } },
        ],
        messages: req.messages,
      })

      const text = response.content
        .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n\n')

      return {
        text,
        tokensInput: response.usage.input_tokens ?? 0,
        tokensOutput: response.usage.output_tokens ?? 0,
        tokensCachedRead: response.usage.cache_read_input_tokens ?? undefined,
        tokensCachedWrite: response.usage.cache_creation_input_tokens ?? undefined,
      }
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        throw new ChatAdapterError('Anthropic rate limit', 429, 'rate_limit')
      }
      if (err instanceof Anthropic.AuthenticationError) {
        throw new ChatAdapterError('Anthropic key rejected', 401, 'auth')
      }
      if (err instanceof Anthropic.APIError) {
        throw new ChatAdapterError(`Anthropic ${err.status}: ${err.message}`, err.status ?? 500)
      }
      throw err
    }
  },
}
