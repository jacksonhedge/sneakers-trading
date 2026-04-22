/**
 * Provider-agnostic chat adapter contract. Every adapter implements this so
 * the API route can switch on `model.provider` without knowing SDK details.
 *
 * The shape is intentionally narrow: we don't surface tool use, streaming,
 * or multi-modal content in the O'Toole chat today. Adapters can ignore
 * features the provider doesn't support as long as they return a reasonable
 * text response + best-effort token counts.
 */
export type ChatRole = 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }

export type ChatResult = {
  text: string
  tokensInput: number
  tokensOutput: number
  /** Optional — Anthropic's cache stats. Other providers return 0/undefined. */
  tokensCachedRead?: number
  tokensCachedWrite?: number
}

export type ChatRequest = {
  modelId: string
  systemPrompt: string
  marketContext: string
  messages: ChatMessage[]
  /** Max output tokens the adapter should request. Default 2048. */
  maxTokens?: number
  /** Provider API key to use. Injected by the route from env OR the user's BYO key. */
  apiKey: string
}

export interface ChatAdapter {
  provider: 'anthropic' | 'openai' | 'google' | 'xai'
  chat(req: ChatRequest): Promise<ChatResult>
}

export class ChatAdapterError extends Error {
  public readonly status: number
  public readonly providerCode?: string
  constructor(message: string, status: number, providerCode?: string) {
    super(message)
    this.name = 'ChatAdapterError'
    this.status = status
    this.providerCode = providerCode
  }
}
