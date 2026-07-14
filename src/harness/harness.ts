import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import { getHarnessConfig } from './harness.config';
import type { HarnessConfig } from './harness.config.validate';
import { createOpenAiClient } from '../client/createOpenAiClient';
import { hasToolCalls, runTools, toAssistantHistoryMessage } from '../tools/runTools';
import { Agent } from './agent.type';
import type { ChatCompletionClient } from '../client/llmClient.type';
import { emit } from '../cli/jsonl';

export type HarnessOptions = {
  llmClient?: ChatCompletionClient;
  config?: HarnessConfig;
};

export type HarnessRunResult = {
  content: string;
  tokenUsage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  iterations: number;
};

function getResponseMessage(response: OpenAI.Chat.Completions.ChatCompletion): OpenAI.Chat.Completions.ChatCompletionMessage {
  const message = response.choices[0]?.message;
  if (!message) {
    throw new Error('Chat completion API returned an empty response');
  }

  return message;
}

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

  public async run(userCommand: string): Promise<HarnessRunResult> {
    this.userCommand = userCommand;
    emit({ type: 'user_command', command: userCommand });

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

      const responseMessage = getResponseMessage(response);

      if (response.usage) {
        tokenUsage.prompt_tokens += response.usage.prompt_tokens;
        tokenUsage.completion_tokens += response.usage.completion_tokens;
        tokenUsage.total_tokens += response.usage.total_tokens;
        emit({ type: 'tokens', iteration, usage: tokenUsage });
      }

      this.conversationWindow.push(toAssistantHistoryMessage(responseMessage));

      if (hasToolCalls(responseMessage)) {
        const toolResponse = await runTools(responseMessage, this.agent.tools, {
          onAssistantMessage: (content) => emit({ type: 'assistant_message', content }),
          onToolCall: (name, args, toolCallId) =>
            emit({ type: 'tool_call', name, args, toolCallId }),
          onToolResult: (name, content, toolCallId) =>
            emit({ type: 'tool_result', name, content, toolCallId }),
        });
        this.conversationWindow.push(...toolResponse);

        this.agent.onToolRound?.();

        continue;
      }

      const result = {
        content: responseMessage.content ?? '',
        tokenUsage,
        iterations: iteration,
      };
      emit({
        type: 'agent_response',
        content: result.content,
        iterations: result.iterations,
        tokenUsage: result.tokenUsage,
      });
      return result;
    }

    throw new Error('Max iterations reached');
  }
}
