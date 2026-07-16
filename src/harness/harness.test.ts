import { describe, it, expect, vi } from 'vitest';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { z } from 'zod';

import { Harness } from './harness';
import { Agent } from './agent.type';
import type { HarnessConfig } from './harness.config.validate';
import type { ChatCompletionClient } from '../client/llmClient.type';
import { createTool } from '../tools/defineTool';
import { Tool } from '../tools/types';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 3,
};

function makeAgent(tools: Tool<any>[] = []): Agent {
  return { prompt: 'test prompt', tools };
}

function assistantMessage(content: string): OpenAI.Chat.Completions.ChatCompletionMessage {
  return {
    role: 'assistant',
    content,
    refusal: null,
  };
}

function assistantToolCall(
  name: string,
  args: Record<string, unknown>,
  id = 'call_1',
): OpenAI.Chat.Completions.ChatCompletionMessage {
  return {
    role: 'assistant',
    content: null,
    refusal: null,
    tool_calls: [
      {
        id,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(args),
        },
      },
    ],
  };
}

describe('Harness', () => {
  it('accumulates message history across multiple runs', async () => {
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('first') }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('second') }],
      });
    const llmClient: ChatCompletionClient = { createChatCompletion };

    const harness = new Harness(makeAgent(), { llmClient, config: testConfig });
    await harness.run('hello');
    await harness.run('again');

    expect(harness.getTurnCount()).toBe(2);
    expect(harness.getMessageHistory()).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'first' },
      { role: 'user', content: 'again' },
      { role: 'assistant', content: 'second' },
    ]);
    expect(createChatCompletion).toHaveBeenCalledTimes(2);
    expect(createChatCompletion.mock.calls[1][0].messages).toEqual([
      { role: 'system', content: 'test prompt' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'first' },
      { role: 'user', content: 'again' },
    ]);
  });

  it('retries when the model returns an empty text response', async () => {
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('') }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('done') }],
      });
    const llmClient: ChatCompletionClient = { createChatCompletion };

    const harness = new Harness(makeAgent(), { llmClient, config: testConfig });
    const result = await harness.run('hello');

    expect(result.content).toBe('done');
    expect(createChatCompletion).toHaveBeenCalledTimes(2);
    expect(harness.getMessageHistory()).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'done' },
    ]);
  });

  it('finishes when the model returns a text response', async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: assistantMessage('done') }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    const llmClient: ChatCompletionClient = { createChatCompletion };

    const harness = new Harness(makeAgent(), { llmClient, config: testConfig });
    const result = await harness.run('hello');

    expect(result).toEqual({
      content: 'done',
      tokenUsage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
      iterations: 1,
    });
    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    expect(createChatCompletion).toHaveBeenCalledWith({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'test prompt' },
        { role: 'user', content: 'hello' },
      ],
      tools: [],
      tool_choice: 'auto',
    });
  });

  it('runs tools and continues the loop', async () => {
    const echoTool = createTool({
      name: 'echo',
      description: 'echo',
      argsSchema: z.object({ text: z.string() }),
      call: async (args) => `echo:${args.text}`,
    });

    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: assistantToolCall('echo', { text: 'hi' }) }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('finished') }],
      });

    const harness = new Harness(makeAgent([echoTool]), {
      llmClient: { createChatCompletion },
      config: testConfig,
    });
    const result = await harness.run('go');

    expect(result.content).toBe('finished');
    expect(result.iterations).toBe(2);
    expect(createChatCompletion).toHaveBeenCalledTimes(2);
    const secondCallMessages = createChatCompletion.mock.calls[1][0].messages;
    expect(secondCallMessages.some((message: ChatCompletionMessageParam) => message.role === 'tool')).toBe(true);
  });

  it('calls onToolRound after executing tools', async () => {
    const onToolRound = vi.fn();
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: assistantToolCall('missing', {}) }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('done') }],
      });

    const harness = new Harness(
      { ...makeAgent(), onToolRound },
      { llmClient: { createChatCompletion }, config: testConfig },
    );
    await harness.run('go');

    expect(onToolRound).toHaveBeenCalledTimes(1);
  });

  it('throws when the API returns no choices', async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({ choices: [] });
    const harness = new Harness(makeAgent(), {
      llmClient: { createChatCompletion },
      config: testConfig,
    });

    await expect(harness.run('hello')).rejects.toThrow('Chat completion API returned an empty response');
    expect(createChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('throws after max iterations', async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: assistantToolCall('missing', {}) }],
    });

    const harness = new Harness(makeAgent(), {
      llmClient: { createChatCompletion },
      config: { ...testConfig, maxIterations: 2 },
    });

    await expect(harness.run('loop')).rejects.toThrow('Max iterations reached');
    expect(createChatCompletion).toHaveBeenCalledTimes(2);
  });
});
