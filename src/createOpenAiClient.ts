import OpenAI from 'openai';

import { getHarnessConfig } from './harness.config';
import type { HarnessConfig } from './harness.config.validate';
import type { ChatCompletionClient } from './llmClient.type';

export function createOpenAiClient(config: HarnessConfig = getHarnessConfig()): ChatCompletionClient {
  const openai = new OpenAI({
    baseURL: config.openaiBaseUrl,
    apiKey: config.openaiApiKey,
  });

  return {
    createChatCompletion: (params) => openai.chat.completions.create(params),
  };
}
