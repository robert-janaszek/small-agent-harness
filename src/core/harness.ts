import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { createOpenAiClient } from '../client/createOpenAiClient';
import type { ChatCompletionClient } from '../client/llmClient.type';
import { getHarnessConfig } from '../harness/harness.config';
import type { HarnessConfig } from '../harness/harness.config.validate';
import {
  assertUniqueModuleIds,
  collectTools,
  composeSystemPrompt,
  createModuleRuntime,
  HARNESS_PROMPT,
  type Module,
  type ModuleRuntime,
} from './module';
import { createEventBus, type EventBus } from './eventBus';
import { CORE_PROTOCOL_VERSION, type TokenUsage } from './protocol';
import { formatMessageContent, hasToolCalls, runTools, toAssistantHistoryMessage } from './runTools';
import type { Tool } from './tool';

export type HarnessOptions = {
  modules?: Module[];
  prompt?: string;
  llmClient?: ChatCompletionClient;
  config?: HarnessConfig;
  bus?: EventBus;
};

export type HarnessRunOptions = {
  signal?: AbortSignal;
};

export type HarnessRunResult = {
  content: string;
  tokenUsage: TokenUsage;
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
  private modules: Module[];
  private runtimes: Map<string, ModuleRuntime>;
  private tools: Tool<any>[];
  private systemPrompt: string;
  private llmClient: ChatCompletionClient;
  private config: HarnessConfig;
  private bus: EventBus;
  private messageHistory: ChatCompletionMessageParam[];
  private turnCount: number;

  constructor(options: HarnessOptions = {}) {
    this.modules = options.modules ?? [];
    assertUniqueModuleIds(this.modules);
    this.tools = collectTools(this.modules);
    this.systemPrompt = composeSystemPrompt(options.prompt ?? HARNESS_PROMPT, this.modules);
    this.config = options.config ?? getHarnessConfig();
    this.llmClient = options.llmClient ?? createOpenAiClient(this.config);
    this.bus = options.bus ?? createEventBus();
    this.runtimes = new Map(
      this.modules.map((module) => [module.id, createModuleRuntime(module.id, this.bus.emit)]),
    );
    this.messageHistory = [];
    this.turnCount = 0;
  }

  public getMessageHistory(): readonly ChatCompletionMessageParam[] {
    return this.messageHistory;
  }

  public getTurnCount(): number {
    return this.turnCount;
  }

  public startSession(): void {
    this.bus.emit({ type: 'ready', protocolVersion: CORE_PROTOCOL_VERSION });
    this.forEachModule('onSessionStart');
  }

  public resetSession(): void {
    this.messageHistory = [];
    this.turnCount = 0;
    this.forEachModule('onSessionReset');
  }

  public emitError(message: string): void {
    this.bus.emit({ type: 'error', message });
  }

  public endSession(): void {
    this.bus.emit({ type: 'session_end', turnCount: this.turnCount });
  }

  public async run(userCommand: string, options?: HarnessRunOptions): Promise<HarnessRunResult> {
    options?.signal?.throwIfAborted();

    const historyCheckpoint = this.messageHistory.length;
    const turnCheckpoint = this.turnCount;

    try {
      this.bus.emit({ type: 'user_command', command: userCommand });
      this.messageHistory.push({ role: 'user', content: userCommand });
      this.turnCount += 1;

      const tokenUsage: TokenUsage = {
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
            content: this.systemPrompt,
          },
          ...this.messageHistory,
        ];

        const response = await this.llmClient.createChatCompletion(
          {
            model: this.config.modelName,
            messages,
            ...(this.tools.length > 0
              ? { tools: this.tools, tool_choice: 'auto' as const }
              : {}),
          },
          { signal: options?.signal },
        );

        const responseMessage = getResponseMessage(response);

        if (response.usage) {
          tokenUsage.prompt_tokens += response.usage.prompt_tokens;
          tokenUsage.completion_tokens += response.usage.completion_tokens;
          tokenUsage.total_tokens += response.usage.total_tokens;
          this.bus.emit({ type: 'tokens', iteration, usage: tokenUsage });
        }

        this.messageHistory.push(toAssistantHistoryMessage(responseMessage));

        if (hasToolCalls(responseMessage)) {
          options?.signal?.throwIfAborted();

          const toolResponse = await runTools(responseMessage, this.tools, {
            onAssistantMessage: (content) => this.bus.emit({ type: 'assistant_message', content }),
            onToolCall: (name, args, toolCallId) =>
              this.bus.emit({ type: 'tool_call', name, args, toolCallId }),
            onToolResult: (name, content, toolCallId) =>
              this.bus.emit({ type: 'tool_result', name, content, toolCallId }),
          });
          this.messageHistory.push(...toolResponse);
          this.forEachModule('onToolRound');
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
        this.bus.emit({
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

  private forEachModule(hook: 'onSessionStart' | 'onSessionReset' | 'onToolRound'): void {
    for (const module of this.modules) {
      const runtime = this.runtimes.get(module.id);
      if (!runtime) {
        continue;
      }
      module[hook]?.(runtime);
    }
  }
}
