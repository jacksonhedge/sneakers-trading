import type { ChatAdapter, ChatRequest, ChatResult } from './types'
import { chatWithOpenAICompatible } from './openai'

/**
 * xAI adapter — uses the `openai` SDK pointed at xAI's OpenAI-compatible
 * endpoint. Minimal work to wire up once OpenAI adapter exists.
 */
export const xaiAdapter: ChatAdapter = {
  provider: 'xai',
  async chat(req: ChatRequest): Promise<ChatResult> {
    return chatWithOpenAICompatible({
      ...req,
      baseURL: 'https://api.x.ai/v1',
    })
  },
}
