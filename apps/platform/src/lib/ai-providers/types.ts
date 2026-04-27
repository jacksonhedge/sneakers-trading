/**
 * Provider-agnostic chat adapter contract. Every adapter implements this so
 * the API route can switch on `model.provider` without knowing SDK details.
 *
 * Streaming and multi-modal content are still out of scope. Tool use IS now
 * supported (multi-turn loop) for adapters that opt in — the Anthropic adapter
 * does; OpenAI/Google/xAI gracefully ignore the `tools` field for now and
 * return a one-shot text response.
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
  /** How many tool-use turns happened during this chat. 0 if no tools used. */
  toolTurns?: number
}

/**
 * JSON-schema-style tool definition. Mirrors Anthropic's `tools` shape, which
 * is also the most expressive of the providers we support — OpenAI, Google,
 * and xAI all accept narrower forms that we can derive from this.
 */
export type ToolDefinition = {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<
      string,
      {
        type: string
        description?: string
        enum?: readonly string[]
      }
    >
    required?: string[]
  }
}

/**
 * Server-side executor invoked when the model calls a tool. The route owns
 * tool implementations (they touch DB / file system / domain libs); the
 * adapter just routes the call. Return a JSON-stringified payload the model
 * will see as the tool result.
 */
export type ToolExecutor = (
  toolName: string,
  toolInput: unknown,
) => Promise<{ content: string; isError?: boolean }>

export type ChatRequest = {
  modelId: string
  systemPrompt: string
  marketContext: string
  messages: ChatMessage[]
  /** Max output tokens the adapter should request. Default 2048. */
  maxTokens?: number
  /** Provider API key to use. Injected by the route from env OR the user's BYO key. */
  apiKey: string
  /** Tools the model may call. Adapters that don't support tools ignore this. */
  tools?: ToolDefinition[]
  /** Required when `tools` is non-empty. Adapter calls this for each tool_use block. */
  executeToolCall?: ToolExecutor
  /** Cap the tool-loop at N iterations to bound cost + latency. Default 5. */
  maxToolIterations?: number
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
