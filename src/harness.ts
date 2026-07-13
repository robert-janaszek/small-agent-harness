import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import { getHarnessConfig } from './harness.config';
import { hasToolCalls, runTools } from './runTools';
import { Agent } from './agent.type';

let openai: OpenAI | undefined;

function getOpenAI(): OpenAI {
  const config = getHarnessConfig();
  openai ??= new OpenAI({
    baseURL: config.openaiBaseUrl,
    apiKey: config.openaiApiKey,
  });
  return openai;
}

export class Harness {
  private agent: Agent;
  private userCommand: string;
  private conversationWindow: ChatCompletionMessageParam[];

  constructor(agent: Agent) {
    this.agent = agent;
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
    const config = getHarnessConfig();
    let iteration = 0;

    while (iteration < config.maxIterations) {
      iteration++;

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: this.agent.prompt,
        },
        { role: 'user', content: this.userCommand },
        ...this.conversationWindow,
      ];

      const response = await getOpenAI().chat.completions.create({
        model: config.modelName,
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

    console.log('\x1b[31m[Safety]: Max iterations reached\x1b[0m');
  }
}
