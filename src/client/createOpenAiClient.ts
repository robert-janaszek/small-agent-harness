import OpenAI from 'openai';
import { observeOpenAI } from '@langfuse/openai';

import { getHarnessConfig } from '../harness/harness.config';
import type { HarnessConfig } from '../harness/harness.config.validate';
import { isLangfuseEnabled } from '../observability/langfuse';
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
    createChatCompletion: (params, options) => client.chat.completions.create(params, options),
  };
}
