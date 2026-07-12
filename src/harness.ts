import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import { hasToolCalls, runTools } from './runTools';
import { Agent } from './agent.type';
import { printContext } from './modules/smartHome/context';

const openai = new OpenAI({
  baseURL: 'http://127.0.0.1:1234/v1',
  apiKey: 'lmstudio',
});

const MODEL_NAME = 'qwen3:7b';
// const MODEL_NAME = 'qwen/qwen3.6-35b-a3b';

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

    const MAX_ITERATIONS = 15;
    const tokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    }
    let iteration = 0;
  
    while (iteration < MAX_ITERATIONS) {
      iteration++;

      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: this.agent.prompt,
        },
        { role: 'user', content: this.userCommand },
        ...this.conversationWindow,
      ];
  
      const response = await openai.chat.completions.create({
        model: MODEL_NAME,
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

        printContext();
  
        continue;
      }
  
      console.log(`\x1b[32m[Agent]: ${responseMessage.content}\x1b[0m\n`);
      return;
    }
  
    console.log('\x1b[31m[Safety]: Max iterations reached\x1b[0m');
  }
}
