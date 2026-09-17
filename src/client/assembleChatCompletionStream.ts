import type OpenAI from 'openai';

import { toAbortError } from '../core/delay';
import type { ChatCompletionRequestOptions } from './llmClient.type';

type ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;
type ChatCompletionChunk = OpenAI.Chat.Completions.ChatCompletionChunk;
type ToolCallDelta = NonNullable<ChatCompletionChunk['choices'][number]['delta']['tool_calls']>[number];
type FinishReason = ChatCompletion['choices'][number]['finish_reason'];

export type StartedToolCall = {
  id: string;
  name: string;
};

export type StreamPushResult = {
  textDelta?: string;
  reasoningDelta?: string;
  becameToolCall?: boolean;
  startedToolCalls?: StartedToolCall[];
};

type AccumulatedToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  argumentsStarted: boolean;
};

export type ChatCompletionStreamAssembler = {
  push(chunk: ChatCompletionChunk): StreamPushResult;
  flushStartedToolCalls(): StartedToolCall[];
  toChatCompletion(): ChatCompletion;
};

export function createChatCompletionStreamAssembler(): ChatCompletionStreamAssembler {
  let id = '';
  let created = 0;
  let model = '';
  let content = '';
  let reasoning = '';
  let refusal: string | null = null;
  let finishReason: FinishReason = 'stop';
  let usage: ChatCompletion['usage'];
  let sawChoice = false;
  let sawToolCalls = false;
  const toolCalls: AccumulatedToolCall[] = [];
  const announcedToolCalls = new Set<number>();

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
        const startedToolCalls = mergeToolCallDeltas(toolCalls, delta.tool_calls, announcedToolCalls);
        if (startedToolCalls.length > 0) {
          result.startedToolCalls = startedToolCalls;
        }
      }

      const contentText = asDeltaText(delta.content);
      const reasoningText = asDeltaText(
        extraField(delta, 'reasoning_content') ?? extraField(delta, 'reasoning'),
      );

      if (reasoningText.length > 0) {
        reasoning += reasoningText;
        if (!sawToolCalls) {
          result.reasoningDelta = reasoningText;
        }
      }

      if (contentText.length > 0) {
        content += contentText;
        if (!sawToolCalls) {
          result.textDelta = contentText;
        }
      }

      if (typeof delta.refusal === 'string' && delta.refusal.length > 0) {
        refusal = `${refusal ?? ''}${delta.refusal}`;
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
        const flushed = announceReadyToolCalls(toolCalls, announcedToolCalls, true);
        if (flushed.length > 0) {
          result.startedToolCalls = [...(result.startedToolCalls ?? []), ...flushed];
        }
      }

      if (becameToolCall) {
        result.becameToolCall = true;
      }

      return result;
    },
    flushStartedToolCalls() {
      return announceReadyToolCalls(toolCalls, announcedToolCalls, true);
    },
    toChatCompletion() {
      const hasToolCalls = toolCalls.some((toolCall) => toolCall !== undefined);
      const visible = content.length > 0 ? content : hasToolCalls ? '' : reasoning;
      const message: ChatCompletion['choices'][number]['message'] = {
        role: 'assistant',
        content: visible.length > 0 ? visible : null,
        refusal,
      };
      if (reasoning.length > 0) {
        Object.assign(message, { reasoning_content: reasoning });
      }
      const assembledToolCalls = toolCalls
        .filter((toolCall) => toolCall !== undefined)
        .map(({ id: toolCallId, type, function: fn }) => ({
          id: toolCallId,
          type,
          function: { name: fn.name, arguments: fn.arguments },
        }));
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
  callbacks: Pick<
    ChatCompletionRequestOptions,
    'onTextDelta' | 'onReasoningDelta' | 'onTextDeltaCancel' | 'onToolCallStart' | 'signal'
  > = {},
): Promise<ChatCompletion> {
  const assembler = createChatCompletionStreamAssembler();
  let cancelled = false;
  const iterator = stream[Symbol.asyncIterator]();
  const signal = callbacks.signal ?? undefined;

  try {
    while (true) {
      const next = await nextChunk(iterator, signal);
      if (next.done) {
        break;
      }

      const event = assembler.push(next.value);
      if (event.becameToolCall && !cancelled) {
        cancelled = true;
        callbacks.onTextDeltaCancel?.();
      } else if (!cancelled) {
        if (event.reasoningDelta) {
          callbacks.onReasoningDelta?.(event.reasoningDelta);
        }
        if (event.textDelta) {
          callbacks.onTextDelta?.(event.textDelta);
        }
      }

      if (event.startedToolCalls) {
        for (const toolCall of event.startedToolCalls) {
          callbacks.onToolCallStart?.(toolCall.name, toolCall.id);
        }
      }
    }

    for (const toolCall of assembler.flushStartedToolCalls()) {
      callbacks.onToolCallStart?.(toolCall.name, toolCall.id);
    }
  } finally {
    void iterator.return?.();
  }

  if (signal?.aborted) {
    throw toAbortError(signal);
  }

  return assembler.toChatCompletion();
}

async function nextChunk(
  iterator: AsyncIterator<ChatCompletionChunk>,
  signal?: AbortSignal,
): Promise<IteratorResult<ChatCompletionChunk>> {
  if (!signal) {
    return iterator.next();
  }

  if (signal.aborted) {
    throw toAbortError(signal);
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      void iterator.return?.();
      reject(toAbortError(signal));
    };
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };

    signal.addEventListener('abort', onAbort, { once: true });
    iterator.next().then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function mergeToolCallDeltas(
  toolCalls: AccumulatedToolCall[],
  deltas: ToolCallDelta[],
  announced: Set<number>,
): StartedToolCall[] {
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
        argumentsStarted: delta.function?.arguments !== undefined,
      };
    } else {
      if (delta.id) {
        existing.id = delta.id;
      }
      if (delta.function?.name) {
        existing.function.name += delta.function.name;
      }
      if (delta.function?.arguments !== undefined) {
        existing.argumentsStarted = true;
        existing.function.arguments += delta.function.arguments;
      }
    }
  }

  return announceReadyToolCalls(toolCalls, announced, false);
}

function announceReadyToolCalls(
  toolCalls: AccumulatedToolCall[],
  announced: Set<number>,
  force: boolean,
): StartedToolCall[] {
  const started: StartedToolCall[] = [];

  for (const [index, toolCall] of toolCalls.entries()) {
    if (!toolCall || announced.has(index) || !toolCall.id || !toolCall.function.name) {
      continue;
    }
    if (!force && !toolCall.argumentsStarted) {
      continue;
    }

    announced.add(index);
    started.push({ id: toolCall.id, name: toolCall.function.name });
  }

  return started;
}

function extraField(delta: object, key: string): unknown {
  return (delta as Record<string, unknown>)[key];
}

function asDeltaText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (typeof part === 'object' && part !== null && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .join('');
}
