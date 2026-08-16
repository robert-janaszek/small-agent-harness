import { PassThrough } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';

import { createEventBus } from './eventBus';
import { Harness } from './harness';
import type { HarnessConfig } from '../harness/harness.config.validate';
import type { CoreEvent } from './protocol';
import { runServeSession } from './session';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 3,
};

describe('runServeSession', () => {
  it('ends immediately on shutdown during an in-flight turn without a late Cancelled event', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));

    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const createChatCompletion = vi.fn().mockImplementation((_params, options?: { signal?: AbortSignal }) => {
      started();
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });
    const harness = new Harness({
      llmClient: { createChatCompletion },
      config: testConfig,
      bus,
    });

    const stdin = new PassThrough();
    const session = runServeSession(harness, stdin);

    stdin.write('{"type":"user_command","command":"slow"}\n');
    await startedPromise;
    stdin.write('{"type":"shutdown"}\n');
    stdin.end();
    await session;

    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 0 });
    expect(events.some((event) => event.type === 'error' && event.message === 'Cancelled.')).toBe(false);
  });

  it('still emits Cancelled when a turn is aborted without shutdown', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));

    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const createChatCompletion = vi.fn().mockImplementation((_params, options?: { signal?: AbortSignal }) => {
      started();
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      });
    });
    const harness = new Harness({
      llmClient: { createChatCompletion },
      config: testConfig,
      bus,
    });

    const stdin = new PassThrough();
    const session = runServeSession(harness, stdin);

    stdin.write('{"type":"user_command","command":"slow"}\n');
    await startedPromise;
    stdin.write('{"type":"cancel"}\n');
    stdin.end();
    await session;

    expect(events.some((event) => event.type === 'error' && event.message === 'Cancelled.')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 0 });
  });
});
