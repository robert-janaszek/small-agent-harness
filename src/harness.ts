import OpenAI from 'openai';
import {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import { hasToolCalls, runTools } from './runTools';
import { smartHomeAgent } from './modules/smartHome/agent';
import { toolsDefinition } from './modules/smartHome/context';
import { Agent } from './modules/agent.type';

const openai = new OpenAI({
  baseURL: 'http://127.0.0.1:1234/v1',
  apiKey: 'ollama',
});

const MODEL_NAME = 'qwen3:7b';

export class Harness {
  private systemPrompt: string;
  private userCommand: string;
  private conversationWindow: string[];

  constructor(agent: Agent) {
    this.systemPrompt = agent.prompt;
    this.userCommand = '';
    this.conversationWindow = [];
  }

  public run(userCommand: string) {

  }
}

async function runHarness(userCommand: string): Promise<void> {
  console.log(`\n\x1b[36m[User]: ${userCommand}\x1b[0m`);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: smartHomeAgent.prompt
    },
    { role: 'user', content: userCommand }
  ];

  const MAX_ITERATIONS = 15;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: messages,
      tools: toolsDefinition as ChatCompletionTool[],
      tool_choice: 'auto',
    });

    const responseMessage = response.choices[0].message;

    if (response.usage) {
      console.log(`\x1b[33m[Tokens]: ${JSON.stringify(response.usage)}\x1b[0m`);
    }

    messages.push(responseMessage);

    if (hasToolCalls(responseMessage)) {
      await runTools(responseMessage, toolsDefinition);

      continue;
    }

    console.log(`\x1b[32m[Agent]: ${responseMessage.content}\x1b[0m\n`);
    return;
  }

  console.log('\x1b[31m[Safety]: Max iterations reached\x1b[0m');
}

void runHarness("turn off all lights in the living room");
