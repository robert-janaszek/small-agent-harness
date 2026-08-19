import type OpenAI from 'openai';

import type { ChatCompletionRequestOptions } from './llmClient.type';

type ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;
type ChatCompletionChunk = OpenAI.Chat.Completions.ChatCompletionChunk;
type ToolCallDelta = NonNullable<ChatCompletionChunk['choices'][number]['delta']['tool_calls']>[number];
type FinishReason = ChatCompletion['choices'][number]['finish_reason'];

export type StreamPushResult = {
  textDelta?: string;
  becameToolCall?: boolean;
};

type AccumulatedToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatCompletionStreamAssembler = {
  push(chunk: ChatCompletionChunk): StreamPushResult;
  toChatCompletion(): ChatCompletion;
};

export function createChatCompletionStreamAssembler(): ChatCompletionStreamAssembler {
  let id = '';
  let created = 0;
  let model = '';
  let content = '';
  let refusal: string | null = null;
  let finishReason: FinishReason = 'stop';
  let usage: ChatCompletion['usage'];
  let sawChoice = false;
  let sawToolCalls = false;
  const toolCalls: AccumulatedToolCall[] = [];

  return {
    push(chunk) {
      const result: StreamPushResult = {};

      if (chunk.id) {
        id = chunk.id;
      }
      if (chunk.created) {
        created = chunk.created;
      }
      if (chunk.model) {
        model = chunk.model;
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }

      const choice = chunk.choices[0];
      if (!choice) {
        return result;
      }

      sawChoice = true;
      const delta = choice.delta;
      const becameToolCall = Boolean(delta.tool_calls && delta.tool_calls.length > 0 && !sawToolCalls);

      if (delta.tool_calls && delta.tool_calls.length > 0) {
        sawToolCalls = true;
        mergeToolCallDeltas(toolCalls, delta.tool_calls);
      }

      if (typeof delta.content === 'string' && delta.content.length > 0) {
        content += delta.content;
        if (!sawToolCalls) {
          result.textDelta = delta.content;
        }
      }

      if (typeof delta.refusal === 'string' && delta.refusal.length > 0) {
        refusal = `${refusal ?? ''}${delta.refusal}`;
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      if (becameToolCall) {
        result.becameToolCall = true;
      }

      return result;
    },
    toChatCompletion() {
      const message: ChatCompletion['choices'][number]['message'] = {
        role: 'assistant',
        content: content.length > 0 ? content : null,
        refusal,
      };
      const assembledToolCalls = toolCalls.filter((toolCall) => toolCall !== undefined);
      if (assembledToolCalls.length > 0) {
        message.tool_calls = assembledToolCalls;
      }

      return {
        id,
        object: 'chat.completion',
        created,
        model,
        choices: sawChoice
          ? [
              {
                index: 0,
                finish_reason: finishReason,
                logprobs: null,
                message,
              },
            ]
          : [],
        ...(usage ? { usage } : {}),
      };
    },
  };
}

export async function consumeChatCompletionStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  callbacks: Pick<ChatCompletionRequestOptions, 'onTextDelta' | 'onTextDeltaCancel'> = {},
): Promise<ChatCompletion> {
  const assembler = createChatCompletionStreamAssembler();
  let cancelled = false;

  for await (const chunk of stream) {
    const event = assembler.push(chunk);
    if (event.becameToolCall && !cancelled) {
      cancelled = true;
      callbacks.onTextDeltaCancel?.();
    } else if (event.textDelta && !cancelled) {
      callbacks.onTextDelta?.(event.textDelta);
    }
  }

  return assembler.toChatCompletion();
}

function mergeToolCallDeltas(toolCalls: AccumulatedToolCall[], deltas: ToolCallDelta[]): void {
  for (const delta of deltas) {
    const existing = toolCalls[delta.index];
    if (!existing) {
      toolCalls[delta.index] = {
        id: delta.id ?? '',
        type: 'function',
        function: {
          name: delta.function?.name ?? '',
          arguments: delta.function?.arguments ?? '',
        },
      };
      continue;
    }

    if (delta.id) {
      existing.id = delta.id;
    }
    if (delta.function?.name) {
      existing.function.name += delta.function.name;
    }
    if (delta.function?.arguments) {
      existing.function.arguments += delta.function.arguments;
    }
  }
}
