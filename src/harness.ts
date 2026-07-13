import {
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import { getHarnessConfig } from './harness.config';
import type { HarnessConfig } from './harness.config.validate';
import { createOpenAiClient } from './createOpenAiClient';
import { hasToolCalls, runTools } from './runTools';
import { Agent } from './agent.type';
import type { ChatCompletionClient } from './llmClient.type';

export type HarnessOptions = {
  llmClient?: ChatCompletionClient;
  config?: HarnessConfig;
};

export class Harness {
  private agent: Agent;
  private llmClient: ChatCompletionClient;
  private config: HarnessConfig;
  private userCommand: string;
  private conversationWindow: ChatCompletionMessageParam[];

  constructor(agent: Agent, options: HarnessOptions = {}) {
    this.agent = agent;
    this.config = options.config ?? getHarnessConfig();
    this.llmClient = options.llmClient ?? createOpenAiClient(this.config);
    this.userCommand = '';
    this.conversationWindow = [];
  }

  public async run(userCommand: string) {
    this.userCommand = userCommand;
    console.log(`\n\x1b[36m[User]: ${userCommand}\x1b[0m`);

    const tokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    let iteration = 0;

    while (iteration < this.config.maxIterations) {
      iteration++;

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: this.agent.prompt,
        },
        { role: 'user', content: this.userCommand },
        ...this.conversationWindow,
      ];

      const response = await this.llmClient.createChatCompletion({
        model: this.config.modelName,
        messages: messages,
        tools: this.agent.tools,
        tool_choice: 'auto',
      });

      const responseMessage = response.choices[0].message;

      if (response.usage) {
        tokenUsage.prompt_tokens += response.usage.prompt_tokens;
        tokenUsage.completion_tokens += response.usage.completion_tokens;
        tokenUsage.total_tokens += response.usage.total_tokens;
        console.log(`\x1b[33m[Tokens]: ${JSON.stringify(tokenUsage)}\x1b[0m`);
      }

      this.conversationWindow.push(responseMessage);

      if (hasToolCalls(responseMessage)) {
        const toolResponse = await runTools(responseMessage, this.agent.tools);
        this.conversationWindow.push(...toolResponse);

        this.agent.onToolRound?.();

        continue;
      }

      console.log(`\x1b[32m[Agent]: ${responseMessage.content}\x1b[0m\n`);
      return;
    }

    throw new Error('Max iterations reached');
  }
}
