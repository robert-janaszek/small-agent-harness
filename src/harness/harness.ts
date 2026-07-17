import OpenAI from 'openai';
import {
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

import { getHarnessConfig } from './harness.config';
import type { HarnessConfig } from './harness.config.validate';
import { createOpenAiClient } from '../client/createOpenAiClient';
import { hasToolCalls, runTools, toAssistantHistoryMessage, formatMessageContent } from '../tools/runTools';
import { Agent } from './agent.type';
import type { ChatCompletionClient } from '../client/llmClient.type';
import { emit } from '../cli/jsonl';

export type HarnessOptions = {
  llmClient?: ChatCompletionClient;
  config?: HarnessConfig;
};

export type HarnessRunOptions = {
  signal?: AbortSignal;
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export class Harness {
  private agent: Agent;
  private llmClient: ChatCompletionClient;
  private config: HarnessConfig;
  private messageHistory: ChatCompletionMessageParam[];
  private turnCount: number;

  constructor(agent: Agent, options: HarnessOptions = {}) {
    this.agent = agent;
    this.config = options.config ?? getHarnessConfig();
    this.llmClient = options.llmClient ?? createOpenAiClient(this.config);
    this.messageHistory = [];
    this.turnCount = 0;
  }

  public getMessageHistory(): readonly ChatCompletionMessageParam[] {
    return this.messageHistory;
  }

  public getTurnCount(): number {
    return this.turnCount;
  }

  public async run(userCommand: string, options?: HarnessRunOptions): Promise<HarnessRunResult> {
    options?.signal?.throwIfAborted();

    const historyCheckpoint = this.messageHistory.length;
    const turnCheckpoint = this.turnCount;

    try {
      emit({ type: 'user_command', command: userCommand });
      this.messageHistory.push({ role: 'user', content: userCommand });
      this.turnCount += 1;

      const tokenUsage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      let iteration = 0;

      while (iteration < this.config.maxIterations) {
        options?.signal?.throwIfAborted();
        iteration++;

        const messages: ChatCompletionMessageParam[] = [
          {
            role: 'system',
            content: this.agent.prompt,
          },
          ...this.messageHistory,
        ];

        const response = await this.llmClient.createChatCompletion(
          {
            model: this.config.modelName,
            messages: messages,
            tools: this.agent.tools,
            tool_choice: 'auto',
          },
          { signal: options?.signal },
        );

        const responseMessage = getResponseMessage(response);

        if (response.usage) {
          tokenUsage.prompt_tokens += response.usage.prompt_tokens;
          tokenUsage.completion_tokens += response.usage.completion_tokens;
          tokenUsage.total_tokens += response.usage.total_tokens;
          emit({ type: 'tokens', iteration, usage: tokenUsage });
        }

        this.messageHistory.push(toAssistantHistoryMessage(responseMessage));

        if (hasToolCalls(responseMessage)) {
          options?.signal?.throwIfAborted();

          const toolResponse = await runTools(responseMessage, this.agent.tools, {
            onAssistantMessage: (content) => emit({ type: 'assistant_message', content }),
            onToolCall: (name, args, toolCallId) =>
              emit({ type: 'tool_call', name, args, toolCallId }),
            onToolResult: (name, content, toolCallId) =>
              emit({ type: 'tool_result', name, content, toolCallId }),
          });
          this.messageHistory.push(...toolResponse);

          this.agent.onToolRound?.();

          continue;
        }

        const content = formatMessageContent(responseMessage.content);
        if (!content) {
          this.messageHistory.pop();
        }

        const result = {
          content,
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
    } catch (error) {
      if (isAbortError(error)) {
        this.messageHistory.length = historyCheckpoint;
        this.turnCount = turnCheckpoint;
      }
      throw error;
    }
  }
}
