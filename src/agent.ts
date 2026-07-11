import OpenAI from 'openai';
import {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import { createTools } from './tools/registry';
import { ToolContext } from './tools/types';
import { hasToolCalls, runTools } from './runTools';

const openai = new OpenAI({
  baseURL: 'http://127.0.0.1:1234/v1',
  apiKey: 'ollama',
});

const MODEL_NAME = 'qwen3:7b';

const context: ToolContext = {
  knownDevices: [
    'light.salon.1',
    'light.salon.2',
    'light.salon.3',
    'light.lazienka',
  ],
  deviceState: {
    'light.salon.1': 'ON',
    'light.salon.2': 'ON',
    'light.salon.3': 'ON',
    'light.lazienka': 'ON',
  },
};

const toolsDefinition = createTools(context);

async function runAgent(userCommand: string): Promise<void> {
  console.log(`\n\x1b[36m[User]: ${userCommand}\x1b[0m`);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are a proactive smart home manager running in a loop.
Always verify that every command actually succeeded by checking device state after executing an action.
If something fails, retry or try an alternative approach.
There is no human-in-the-loop.
Do not ask it any questions (even for permission).
Focus on actions, not conversation.
Do not finish until you have confirmed the task is fully and correctly done.`
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

void runAgent("turn off all lights in the living room");
