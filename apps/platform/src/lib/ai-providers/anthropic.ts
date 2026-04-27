import Anthropic from '@anthropic-ai/sdk'
import type { ChatAdapter, ChatRequest, ChatResult } from './types'
import { ChatAdapterError } from './types'

/**
 * Anthropic adapter — Claude-via-SDK with prompt caching + tool-use loop.
 * Anthropic's cache is the unit-economics lever (cached_read tokens cost ~10%
 * of fresh input tokens); we cache the static `marketContext` block. Tools
 * are looped server-side: the adapter calls `executeToolCall` for each
 * `tool_use` block emitted by Claude, feeds the result back, and continues
 * until Claude emits an `end_turn` (or the iteration cap is hit).
 */
export const anthropicAdapter: ChatAdapter = {
  provider: 'anthropic',
  async chat(req: ChatRequest): Promise<ChatResult> {
    const client = new Anthropic({ apiKey: req.apiKey })
    const useTools = (req.tools?.length ?? 0) > 0 && !!req.executeToolCall
    const maxIterations = req.maxToolIterations ?? 5

    // Conversation state — starts as the user/assistant messages from the
    // route, then grows with assistant tool_use blocks + user tool_result
    // blocks across turns. Anthropic's API expects content as either a string
    // (legacy) or an array of blocks; we always use the array form once tools
    // enter the picture so the model can return mixed text + tool_use.
    type AnthropicMessage = Anthropic.MessageParam
    const messages: AnthropicMessage[] = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    let totalInput = 0
    let totalOutput = 0
    let totalCachedRead = 0
    let totalCachedWrite = 0
    let toolTurns = 0
    let lastTextResponse = ''

    try {
      for (let iter = 0; iter <= maxIterations; iter++) {
        const isLastIteration = iter === maxIterations
        const response = await client.messages.create({
          model: req.modelId,
          max_tokens: req.maxTokens ?? 2048,
          system: [
            { type: 'text', text: req.systemPrompt },
            { type: 'text', text: req.marketContext, cache_control: { type: 'ephemeral' } },
          ],
          messages,
          // On the final allowed iteration, drop tools so Claude is forced
          // to return a final text response instead of asking for another
          // tool call we can't service.
          ...(useTools && !isLastIteration ? { tools: req.tools } : {}),
        })

        totalInput += response.usage.input_tokens ?? 0
        totalOutput += response.usage.output_tokens ?? 0
        totalCachedRead += response.usage.cache_read_input_tokens ?? 0
        totalCachedWrite += response.usage.cache_creation_input_tokens ?? 0

        // Pull text blocks for the running "last text" response — useful if
        // the model emits prose alongside tool_use, and as the final answer
        // when no more tool_use follows.
        const textOnly = response.content
          .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text)
          .join('\n\n')
        if (textOnly) lastTextResponse = textOnly

        // If Claude doesn't want to call any more tools, we're done.
        const toolUseBlocks = response.content.filter(
          (b): b is Extract<typeof b, { type: 'tool_use' }> => b.type === 'tool_use',
        )
        if (toolUseBlocks.length === 0 || response.stop_reason !== 'tool_use') {
          break
        }

        // Append the assistant's full response (text + tool_use blocks) to
        // the conversation, then run each tool and append the results.
        messages.push({ role: 'assistant', content: response.content })

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of toolUseBlocks) {
          toolTurns += 1
          let resultContent = ''
          let isError = false
          try {
            const r = await req.executeToolCall!(block.name, block.input)
            resultContent = r.content
            isError = r.isError === true
          } catch (err) {
            resultContent = `Tool execution failed: ${(err as Error).message}`
            isError = true
            console.error('[anthropic] tool exec threw', err)
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: resultContent,
            is_error: isError,
          })
        }
        messages.push({ role: 'user', content: toolResults })
      }

      return {
        text: lastTextResponse || "(O'Toole used tools but didn't compose a final response — try rephrasing.)",
        tokensInput: totalInput,
        tokensOutput: totalOutput,
        tokensCachedRead: totalCachedRead || undefined,
        tokensCachedWrite: totalCachedWrite || undefined,
        toolTurns,
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
