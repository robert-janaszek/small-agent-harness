import OpenAI from 'openai';
import { observeOpenAI } from '@langfuse/openai';

import { getHarnessConfig } from '../core/config';
import type { HarnessConfig } from '../core/config.validate';
import { isLangfuseEnabled } from '../observability/langfuse';
import { consumeChatCompletionStream } from './assembleChatCompletionStream';
import type { ChatCompletionClient } from './llmClient.type';

export function createOpenAiClient(config: HarnessConfig = getHarnessConfig()): ChatCompletionClient {
  const openai = new OpenAI({
    baseURL: config.openaiBaseUrl,
    apiKey: config.openaiApiKey,
  });

  const client = isLangfuseEnabled()
    ? observeOpenAI(openai, { generationName: 'chat-completion' })
    : openai;

  return {
    async createChatCompletion(params, options) {
      const { onTextDelta, onTextDeltaCancel, ...requestOptions } = options ?? {};
      const stream = (await client.chat.completions.create(
        {
          ...params,
          stream: true,
          stream_options: { include_usage: true },
        },
        requestOptions,
      )) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      return consumeChatCompletionStream(stream, { onTextDelta, onTextDeltaCancel });
    },
  };
}
