import { describe, it, expect, vi } from 'vitest';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { z } from 'zod';

import { Harness } from './harness';
import { createEventBus } from './eventBus';
import { composeSystemPrompt, HARNESS_PROMPT, type Module } from './module';
import type { CoreEvent } from './protocol';
import { createTool } from './tool';
import type { HarnessConfig } from '../harness/harness.config.validate';
import type { ChatCompletionClient } from '../client/llmClient.type';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 3,
};

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

function createTestHarness(
  llmClient: ChatCompletionClient,
  options: { modules?: Module[]; prompt?: string; events?: CoreEvent[] } = {},
) {
  const events = options.events ?? [];
  const bus = createEventBus();
  bus.subscribe((event) => events.push(event));
  const harness = new Harness({
    modules: options.modules ?? [],
    prompt: options.prompt,
    llmClient,
    config: testConfig,
    bus,
  });
  return { harness, events, bus };
}

describe('core Harness', () => {
  it('answers a user question without sending tools when no modules are loaded', async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: assistantMessage('4') }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    });
    const { harness, events } = createTestHarness({ createChatCompletion });

    const result = await harness.run('what is 2+2');

    expect(result).toEqual({
      content: '4',
      tokenUsage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      iterations: 1,
    });
    expect(createChatCompletion).toHaveBeenCalledWith(
      {
        model: 'test-model',
        messages: [
          { role: 'system', content: HARNESS_PROMPT },
          { role: 'user', content: 'what is 2+2' },
        ],
      },
      { signal: undefined },
    );
    expect(createChatCompletion.mock.calls[0][0].tools).toBeUndefined();
    expect(createChatCompletion.mock.calls[0][0].tool_choice).toBeUndefined();
    expect(events.map((event) => event.type)).toEqual(['user_command', 'tokens', 'agent_response']);
  });

  it('accumulates message history across multiple runs', async () => {
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('first') }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('second') }],
      });
    const { harness } = createTestHarness({ createChatCompletion });

    await harness.run('hello');
    await harness.run('again');

    expect(harness.getTurnCount()).toBe(2);
    expect(harness.getMessageHistory()).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'first' },
      { role: 'user', content: 'again' },
      { role: 'assistant', content: 'second' },
    ]);
    expect(createChatCompletion.mock.calls[1][0].messages).toEqual([
      { role: 'system', content: HARNESS_PROMPT },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'first' },
      { role: 'user', content: 'again' },
    ]);
  });

  it('resetSession clears history and turn count and invokes module reset', async () => {
    const onSessionReset = vi.fn();
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: assistantMessage('ok') }],
    });
    const { harness } = createTestHarness(
      { createChatCompletion },
      { modules: [{ id: 'echo', onSessionReset }] },
    );

    await harness.run('hello');
    const sessionIdBefore = harness.getSessionId();
    harness.resetSession();

    expect(harness.getMessageHistory()).toEqual([]);
    expect(harness.getTurnCount()).toBe(0);
    expect(harness.getSessionId()).not.toBe(sessionIdBefore);
    expect(onSessionReset).toHaveBeenCalledTimes(1);

    await harness.run('again');
    expect(createChatCompletion.mock.calls[1][0].messages).toEqual([
      { role: 'system', content: HARNESS_PROMPT },
      { role: 'user', content: 'again' },
    ]);
  });

  it('ends the turn when the model returns an empty text response', async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: assistantMessage('') }],
    });
    const { harness } = createTestHarness({ createChatCompletion });
    const result = await harness.run('hello');

    expect(result.content).toBe('');
    expect(result.iterations).toBe(1);
    expect(harness.getMessageHistory()).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('runs a dummy module tool and emits a namespaced module event after the round', async () => {
    const echoTool = createTool({
      name: 'echo',
      description: 'echo',
      argsSchema: z.object({ text: z.string() }),
      activity: { present: 'echoing', past: 'echoed' },
      call: async (args) => `echo:${args.text}`,
    });
    const echoModule: Module = {
      id: 'echo',
      prompt: 'You can echo text with the echo tool.',
      tools: [echoTool],
      onToolRound: (runtime) => runtime.emit('round_done', { ok: true }),
    };

    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: assistantToolCall('echo', { text: 'hi' }) }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('finished') }],
      });

    const { harness, events } = createTestHarness(
      { createChatCompletion },
      { modules: [echoModule] },
    );
    const result = await harness.run('go');

    expect(result.content).toBe('finished');
    expect(result.iterations).toBe(2);
    expect(createChatCompletion.mock.calls[0][0].tools).toEqual([echoTool]);
    expect(createChatCompletion.mock.calls[0][0].tool_choice).toBe('auto');
    expect(createChatCompletion.mock.calls[0][0].messages[0]).toEqual({
      role: 'system',
      content: `${HARNESS_PROMPT}\n\n# Module: echo\nYou can echo text with the echo tool.`,
    });

    const secondCallMessages = createChatCompletion.mock.calls[1][0].messages;
    expect(secondCallMessages.some((message: ChatCompletionMessageParam) => message.role === 'tool')).toBe(true);

    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'tool_call', name: 'echo', args: { text: 'hi' }, toolCallId: 'call_1' },
        { type: 'tool_result', name: 'echo', content: 'echo:hi', toolCallId: 'call_1' },
        { type: 'module', module: 'echo', event: 'round_done', payload: { ok: true } },
        expect.objectContaining({ type: 'agent_response', content: 'finished' }),
      ]),
    );
  });

  it('prefixes module instructions onto the harness system prompt', () => {
    expect(
      composeSystemPrompt(HARNESS_PROMPT, [{ id: 'echo', prompt: 'Use the echo tool.' }]),
    ).toBe(`${HARNESS_PROMPT}\n\n# Module: echo\nUse the echo tool.`);
  });

  it('leaves ask-the-user policy to modules instead of the base harness prompt', () => {
    expect(HARNESS_PROMPT).toContain('whether you may ask the user questions');
    expect(HARNESS_PROMPT).toContain('Module instructions override these defaults');
    expect(HARNESS_PROMPT).not.toContain('Ask only when something is still missing');
    expect(HARNESS_PROMPT).not.toContain('This is a conversation with a human');
  });

  it('emits ready and module session-start events', () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const harness = new Harness({
      modules: [
        {
          id: 'echo',
          onSessionStart: (runtime) => runtime.emit('started'),
        },
      ],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });

    harness.startSession();

    expect(events).toEqual([
      { type: 'ready', protocolVersion: 1 },
      { type: 'module', module: 'echo', event: 'started' },
    ]);
  });

  it('throws when the API returns no choices', async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({ choices: [] });
    const { harness } = createTestHarness({ createChatCompletion });

    await expect(harness.run('hello')).rejects.toThrow('Chat completion API returned an empty response');
  });

  it('throws after max iterations', async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: assistantToolCall('missing', {}) }],
    });
    const harness = new Harness({
      llmClient: { createChatCompletion },
      config: { ...testConfig, maxIterations: 2 },
    });

    await expect(harness.run('loop')).rejects.toThrow('Max iterations reached');
    expect(createChatCompletion).toHaveBeenCalledTimes(2);
  });

  it('throws AbortError when signal is aborted before run starts', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const createChatCompletion = vi.fn();
    const harness = new Harness({
      llmClient: { createChatCompletion },
      config: testConfig,
      bus,
    });

    const controller = new AbortController();
    controller.abort();

    await expect(harness.run('hello', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(harness.getMessageHistory()).toEqual([]);
    expect(harness.getTurnCount()).toBe(0);
    expect(events.some((event) => event.type === 'agent_response')).toBe(false);
  });

  it('rolls back history and turnCount when a run is aborted mid-turn', async () => {
    const controller = new AbortController();
    let callCount = 0;

    const createChatCompletion = vi.fn().mockImplementation((_params, options?: { signal?: AbortSignal }) => {
      callCount += 1;

      if (callCount === 1) {
        return Promise.resolve({
          choices: [{ message: assistantMessage('first') }],
        });
      }

      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });

    const { harness } = createTestHarness({ createChatCompletion });

    await harness.run('hello');
    expect(harness.getTurnCount()).toBe(1);

    const runPromise = harness.run('cancel me', { signal: controller.signal });
    await Promise.resolve();
    controller.abort();

    await expect(runPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(harness.getTurnCount()).toBe(1);
    expect(harness.getMessageHistory()).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'first' },
    ]);
  });

  it('endSession reports committed turns and drops later events while a turn is in flight', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    let callCount = 0;
    const createChatCompletion = vi.fn().mockImplementation((_params, options?: { signal?: AbortSignal }) => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({
          choices: [{ message: assistantMessage('first') }],
        });
      }

      started();
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });
    const { harness, events } = createTestHarness({ createChatCompletion });

    await harness.run('hello');
    expect(harness.getTurnCount()).toBe(1);

    const runPromise = harness.run('cancel me', { signal: controller.signal });
    await startedPromise;

    harness.endSession();
    controller.abort();
    await expect(runPromise).rejects.toMatchObject({ name: 'AbortError' });
    harness.emitError('Cancelled.');

    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 1 });
    expect(events.some((event) => event.type === 'error')).toBe(false);
    expect(harness.getTurnCount()).toBe(1);
  });

  it('endSession reports the current turnCount when no turn is in flight', async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [{ message: assistantMessage('ok') }],
    });
    const { harness, events } = createTestHarness({ createChatCompletion });

    await harness.run('hello');
    harness.endSession();

    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 1 });
  });

  it('rejects duplicate module ids', () => {
    expect(
      () =>
        new Harness({
          modules: [{ id: 'echo' }, { id: 'echo' }],
          llmClient: { createChatCompletion: vi.fn() },
          config: testConfig,
        }),
    ).toThrow('Duplicate module id "echo"');
  });

  it('rejects duplicate tool names across modules', () => {
    const echo = createTool({
      name: 'echo',
      description: 'echo',
      argsSchema: z.object({}),
      activity: { present: 'echoing', past: 'echoed' },
      call: async () => 'ok',
    });

    expect(
      () =>
        new Harness({
          modules: [
            { id: 'a', tools: [echo] },
            { id: 'b', tools: [echo] },
          ],
          llmClient: { createChatCompletion: vi.fn() },
          config: testConfig,
        }),
    ).toThrow('Duplicate tool "echo" registered by modules "a" and "b"');
  });
});
