import { describe, it, expect, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';

import { Harness } from '../harness/harness';
import { Agent } from '../harness/agent.type';
import type { HarnessConfig } from '../harness/harness.config.validate';
import type { ChatCompletionClient } from '../client/llmClient.type';
import { parseHarnessCommandLine, readHarnessCommands } from './readHarnessCommands';
import { resetEmitWriter, setEmitWriter, type HarnessEvent } from './jsonl';
import { runHarnessServeSession } from './sessionLoop';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 3,
};

function makeAgent(): Agent {
  return { prompt: 'test prompt', tools: [] };
}

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
