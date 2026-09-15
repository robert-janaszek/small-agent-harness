import OpenAI from 'openai';
import type { LangfuseGenerationAttributes } from '@langfuse/tracing';

import { getHarnessConfig } from '../core/config';
import type { HarnessConfig } from '../core/config.validate';
import { withGenerationObservation } from '../observability/langfuse';
import { consumeChatCompletionStream } from './assembleChatCompletionStream';
import type { ChatCompletionClient } from './llmClient.type';

type ChatCompletionParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;

function toolNamesFromParams(tools: ChatCompletionParams['tools']): string[] {
  if (!tools) {
    return [];
  }

  const names: string[] = [];
  for (const tool of tools) {
    if (tool.type === 'function' && 'function' in tool && typeof tool.function.name === 'string') {
      names.push(tool.function.name);
    }
  }
  return names;
}

/** ChatML input only — tool JSON schemas must not go on generation.input (Langfuse dumps them as Additional Input). */
export function toChatCompletionGenerationAttrs(params: ChatCompletionParams): {
  name: 'chat-completion';
  input: ChatCompletionParams['messages'];
  model: string;
  modelParameters?: LangfuseGenerationAttributes['modelParameters'];
  metadata?: { tools: string[] };
} {
  const toolNames = toolNamesFromParams(params.tools);
  const modelParameters: NonNullable<LangfuseGenerationAttributes['modelParameters']> = {};
  if (params.max_tokens !== undefined && params.max_tokens !== null) {
    modelParameters.max_tokens = params.max_tokens;
  }
  if (typeof params.tool_choice === 'string') {
    modelParameters.tool_choice = params.tool_choice;
  }

  return {
    name: 'chat-completion',
    input: params.messages,
    model: params.model,
    ...(Object.keys(modelParameters).length > 0 ? { modelParameters } : {}),
    ...(toolNames.length > 0 ? { metadata: { tools: toolNames } } : {}),
  };
}

function usageDetailsFromCompletion(
  usage: ChatCompletion['usage'],
): LangfuseGenerationAttributes['usageDetails'] | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    input: usage.prompt_tokens,
    output: usage.completion_tokens,
    total: usage.total_tokens,
  };
}

type MessageWithReasoning = ChatCompletion['choices'][number]['message'] & {
  reasoning_content?: string;
};

function extraString(value: object, key: string): string {
  const extra = (value as Record<string, unknown>)[key];
  return typeof extra === 'string' ? extra : '';
}

/** ChatML thinking blocks — Langfuse renders these as a Thinking section. */
function toLangfuseGenerationOutput(
  message: ChatCompletion['choices'][number]['message'] | undefined,
): unknown {
  if (!message) {
    return null;
  }

  const reasoning = extraString(message, 'reasoning_content');
  const { reasoning_content: _reasoningContent, ...rest } = message as MessageWithReasoning;
  if (!reasoning) {
    return rest;
  }

  return {
    ...rest,
    ...(rest.content === reasoning ? { content: null } : {}),
    thinking: [{ type: 'thinking', content: reasoning }],
  };
}

/** Prefer the model the API actually served — routers and aliases often differ from the request. */
export function toChatCompletionGenerationResultAttrs(
  completion: ChatCompletion,
  requestedModel: string,
): LangfuseGenerationAttributes {
  const servedModel = completion.model?.trim() ?? '';
  const metadata: Record<string, unknown> = {};
  if (servedModel && servedModel !== requestedModel) {
    metadata.requestedModel = requestedModel;
  }

  return {
    output: toLangfuseGenerationOutput(completion.choices[0]?.message),
    usageDetails: usageDetailsFromCompletion(completion.usage),
    ...(servedModel ? { model: servedModel } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

export function createOpenAiClient(config: HarnessConfig = getHarnessConfig()): ChatCompletionClient {
  const openai = new OpenAI({
    baseURL: config.openaiBaseUrl,
    apiKey: config.openaiApiKey,
  });

  return {
    async createChatCompletion(params, options) {
      const { onTextDelta, onReasoningDelta, onTextDeltaCancel, onToolCallStart, ...requestOptions } = options ?? {};

      return withGenerationObservation(toChatCompletionGenerationAttrs(params), async (observation) => {
        const stream = (await openai.chat.completions.create(
          {
            ...params,
            stream: true,
            stream_options: { include_usage: true },
          },
          requestOptions,
        )) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

        const completion = await consumeChatCompletionStream(stream, {
          onTextDelta,
          onReasoningDelta,
          onTextDeltaCancel,
          onToolCallStart,
          signal: requestOptions.signal ?? undefined,
        });

        observation.update(toChatCompletionGenerationResultAttrs(completion, params.model));

        return completion;
      });
    },
  };
}
