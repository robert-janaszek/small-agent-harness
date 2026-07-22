import { describe, it, expect, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';

import { createSmartHomeAgent } from '../modules/smartHome/agent';
import { Harness } from '../harness/harness';
import { Agent } from '../harness/agent.type';
import type { HarnessConfig } from '../harness/harness.config.validate';
import type { ChatCompletionClient } from '../client/llmClient.type';
import { parseHarnessCommandLine, readHarnessCommands } from './readHarnessCommands';
import { resetEmitWriter, setEmitWriter, type HarnessEvent } from './jsonl';
import { runHarnessServeSession, runHarnessSession } from './sessionLoop';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 3,
};

function makeAgent(): Agent {
  return { prompt: 'test prompt', tools: [] };
}

function makeHarnessWithRun(
  run: Harness['run'],
  turnCount = 0,
): Harness {
  const createChatCompletion = vi.fn().mockResolvedValue({
    choices: [{ message: { role: 'assistant', content: 'ok', refusal: null } }],
  });
  const llmClient: ChatCompletionClient = { createChatCompletion };
  const harness = new Harness(makeAgent(), { llmClient, config: testConfig });
  harness.run = run;
  vi.spyOn(harness, 'getTurnCount').mockReturnValue(turnCount);
  return harness;
}

describe('runHarnessSession', () => {
  afterEach(() => {
    resetEmitWriter();
  });

  it('emits ready, runs commands, and ends with session_end', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const run = vi.fn().mockResolvedValue(undefined);
    const harness = makeHarnessWithRun(run, 1);
    const commands = ['hello', '/exit'];
    let index = 0;

    await runHarnessSession(harness, async () => commands[index++] ?? null);

    expect(events[0]).toEqual({ type: 'ready', protocolVersion: 1 });
    expect(run).toHaveBeenCalledWith('hello');
    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 1 });
  });

  it('skips empty commands without calling harness.run', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const harness = makeHarnessWithRun(run);
    const commands = ['   ', 'go', null];
    let index = 0;

    await runHarnessSession(harness, async () => commands[index++] ?? null);

    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith('go');
  });

  it('emits error and continues when harness.run throws', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const harness = makeHarnessWithRun(run, 1);
    const commands = ['fail', 'recover', null];
    let index = 0;

    await runHarnessSession(harness, async () => commands[index++] ?? null);

    expect(events.some((event) => event.type === 'error' && event.message === 'boom')).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 1 });
  });

  it('ends immediately when readCommand returns null', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const run = vi.fn();
    const harness = makeHarnessWithRun(run, 0);

    await runHarnessSession(harness, async () => null);

    expect(run).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: 'ready', protocolVersion: 1 },
      { type: 'session_end', turnCount: 0 },
    ]);
  });

  it('emits context_init for smart home agents after ready', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const harness = new Harness(createSmartHomeAgent(), { llmClient: { createChatCompletion: vi.fn() }, config: testConfig });

    await runHarnessSession(harness, async () => null);

    expect(events[0]).toEqual({ type: 'ready', protocolVersion: 1 });
    expect(events[1]?.type).toBe('context_init');
    if (events[1]?.type === 'context_init') {
      expect(events[1].changes.length).toBeGreaterThan(0);
    }
    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 0 });
  });
});

describe('parseHarnessCommandLine', () => {
  it('parses user_command', () => {
    expect(parseHarnessCommandLine('{"type":"user_command","command":"hello"}')).toEqual({
      type: 'user_command',
      command: 'hello',
    });
  });

  it('parses shutdown', () => {
    expect(parseHarnessCommandLine('{"type":"shutdown"}')).toEqual({ type: 'shutdown' });
  });

  it('parses cancel', () => {
    expect(parseHarnessCommandLine('{"type":"cancel"}')).toEqual({ type: 'cancel' });
  });

  it('returns null for invalid json', () => {
    expect(parseHarnessCommandLine('not json')).toBeNull();
  });
});

describe('runHarnessServeSession', () => {
  afterEach(() => {
    resetEmitWriter();
  });

  it('handles two commands over stdin and emits session_end', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'first', refusal: null } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'second', refusal: null } }],
      });

    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness(makeAgent(), { llmClient, config: testConfig });

    const stdin = new PassThrough();
    const session = runHarnessServeSession(harness, stdin);

    stdin.write('{"type":"user_command","command":"hello"}\n');
    stdin.write('{"type":"user_command","command":"again"}\n');
    stdin.write('{"type":"shutdown"}\n');
    stdin.end();

    await session;

    expect(events[0]).toEqual({ type: 'ready', protocolVersion: 1 });
    expect(events.some((event) => event.type === 'agent_response' && event.content === 'first')).toBe(true);
    expect(events.some((event) => event.type === 'agent_response' && event.content === 'second')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 2 });
    expect(harness.getTurnCount()).toBe(2);
  });

  it('cancels an in-flight turn and continues with the next command', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    let callCount = 0;
    let firstCallStarted: (() => void) | null = null;
    const firstCallStartedPromise = new Promise<void>((resolve) => {
      firstCallStarted = resolve;
    });

    const createChatCompletion = vi.fn().mockImplementation((_params, options?: { signal?: AbortSignal }) => {
      callCount += 1;
      const signal = options?.signal;

      if (callCount === 1) {
        firstCallStarted?.();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      }

      return Promise.resolve({
        choices: [{ message: { role: 'assistant', content: 'second', refusal: null } }],
      });
    });

    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness(makeAgent(), { llmClient, config: testConfig });

    const stdin = new PassThrough();
    const session = runHarnessServeSession(harness, stdin);

    stdin.write('{"type":"user_command","command":"slow"}\n');
    await firstCallStartedPromise;

    stdin.write('{"type":"cancel"}\n');
    stdin.write('{"type":"user_command","command":"again"}\n');
    stdin.write('{"type":"shutdown"}\n');
    stdin.end();

    await session;

    expect(events.some((event) => event.type === 'error' && event.message === 'Cancelled.')).toBe(true);
    expect(events.some((event) => event.type === 'agent_response' && event.content === 'second')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 1 });
  });

  it('rejects empty user_command with an error event', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const createChatCompletion = vi.fn();
    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness(makeAgent(), { llmClient, config: testConfig });

    const stdin = new PassThrough();
    const session = runHarnessServeSession(harness, stdin);

    stdin.write('{"type":"user_command","command":"   "}\n');
    stdin.write('{"type":"shutdown"}\n');
    stdin.end();

    await session;

    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === 'error' && event.message === 'Command is required.')).toBe(
      true,
    );
  });

  it('emits an error for invalid command lines', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const createChatCompletion = vi.fn();
    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness(makeAgent(), { llmClient, config: testConfig });

    const stdin = new PassThrough();
    const session = runHarnessServeSession(harness, stdin);

    stdin.write('not-json\n');
    stdin.write('{"type":"shutdown"}\n');
    stdin.end();

    await session;

    expect(events.some((event) => event.type === 'error' && event.message === 'Invalid command line: not-json')).toBe(
      true,
    );
  });

  it('aborts an in-flight turn when cancel arrives inline on the stream', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    let callCount = 0;
    let firstCallStarted: (() => void) | null = null;
    const firstCallStartedPromise = new Promise<void>((resolve) => {
      firstCallStarted = resolve;
    });

    const createChatCompletion = vi.fn().mockImplementation((_params, options?: { signal?: AbortSignal }) => {
      callCount += 1;
      const signal = options?.signal;

      if (callCount === 1) {
        firstCallStarted?.();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      }

      return Promise.resolve({
        choices: [{ message: { role: 'assistant', content: 'after-cancel', refusal: null } }],
      });
    });

    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness(makeAgent(), { llmClient, config: testConfig });

    const stdin = new PassThrough();
    const session = runHarnessServeSession(harness, stdin);

    stdin.write('{"type":"user_command","command":"slow"}\n');
    await firstCallStartedPromise;
    stdin.write('{"type":"cancel"}\n');
    stdin.write('{"type":"user_command","command":"next"}\n');
    stdin.write('{"type":"shutdown"}\n');
    stdin.end();

    await session;

    expect(events.some((event) => event.type === 'error' && event.message === 'Cancelled.')).toBe(true);
    expect(events.some((event) => event.type === 'agent_response' && event.content === 'after-cancel')).toBe(
      true,
    );
  });
});

describe('readHarnessCommands', () => {
  it('processes commands sequentially', async () => {
    const order: string[] = [];
    const stdin = new PassThrough();

    const done = readHarnessCommands(stdin, async (command) => {
      if (command.type === 'user_command') {
        order.push(`start:${command.command}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(`end:${command.command}`);
      }
    });

    stdin.write('{"type":"user_command","command":"a"}\n');
    stdin.write('{"type":"user_command","command":"b"}\n');
    stdin.end();

    await done;

    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b']);
  });
});
