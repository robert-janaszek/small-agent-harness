import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcess } from 'node:child_process';

import type { HarnessEvent } from './jsonl';
import {
  HarnessSessionClient,
  isHarnessEvent,
  isTurnBoundaryEvent,
  readHarnessEvents,
  writeHarnessCommand,
} from './harnessClient';

function createMockChild(): ChildProcess & { stdout: PassThrough; stdin: PassThrough } {
  const child = new EventEmitter() as ChildProcess & { stdout: PassThrough; stdin: PassThrough };
  child.stdout = new PassThrough();
  child.stdin = new PassThrough();
  child.exitCode = null;
  return child;
}

let mockChild: ReturnType<typeof createMockChild>;

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => {
      mockChild = createMockChild();
      return mockChild;
    }),
  };
});

function getMockStdout(): PassThrough {
  return mockChild.stdout;
}

function getMockStdin(): PassThrough {
  return mockChild.stdin;
}

describe('writeHarnessCommand', () => {
  it('writes JSONL with a trailing newline', () => {
    const stdin = new PassThrough();
    const chunks: string[] = [];
    stdin.on('data', (chunk) => chunks.push(chunk.toString()));

    writeHarnessCommand(stdin, { type: 'user_command', command: 'hello' });

    expect(chunks.join('')).toBe('{"type":"user_command","command":"hello"}\n');
  });
});

describe('readHarnessEvents', () => {
  it('parses multiple JSON lines from chunked stdout', async () => {
    const stdout = new PassThrough();
    const events: unknown[] = [];

    const done = readHarnessEvents(stdout, (event) => events.push(event));

    stdout.write('{"type":"ready","protocolVersion":1}\n{"type":"error","message":"x"}');
    stdout.end();

    await done;

    expect(events).toEqual([
      { type: 'ready', protocolVersion: 1 },
      { type: 'error', message: 'x' },
    ]);
  });

  it('parses a final buffered line without trailing newline on end', async () => {
    const stdout = new PassThrough();
    const events: unknown[] = [];

    const done = readHarnessEvents(stdout, (event) => events.push(event));

    stdout.write('{"type":"session_end","turnCount":2}');
    stdout.end();

    await done;

    expect(events).toEqual([{ type: 'session_end', turnCount: 2 }]);
  });

  it('reports invalid lines via callback', async () => {
    const stdout = new PassThrough();
    const invalid: string[] = [];

    const done = readHarnessEvents(
      stdout,
      () => {},
      (line) => invalid.push(line),
    );

    stdout.write('not json\n{broken\n');
    stdout.end();

    await done;

    expect(invalid).toEqual(['not json', '{broken']);
  });

  it('rejects when stdout emits an error', async () => {
    const stdout = new PassThrough();
    const done = readHarnessEvents(stdout, () => {});

    stdout.emit('error', new Error('stream failed'));

    await expect(done).rejects.toThrow('stream failed');
  });
});

describe('isHarnessEvent', () => {
  it('accepts objects with a type field', () => {
    expect(isHarnessEvent({ type: 'ready', protocolVersion: 1 })).toBe(true);
  });

  it('rejects null and non-objects', () => {
    expect(isHarnessEvent(null)).toBe(false);
    expect(isHarnessEvent('ready')).toBe(false);
    expect(isHarnessEvent({})).toBe(false);
  });
});

describe('isTurnBoundaryEvent', () => {
  it('returns true for agent_response and error', () => {
    expect(
      isTurnBoundaryEvent({
        type: 'agent_response',
        content: 'done',
        iterations: 1,
        tokenUsage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
    ).toBe(true);
    expect(isTurnBoundaryEvent({ type: 'error', message: 'fail' })).toBe(true);
  });

  it('returns false for non-boundary events', () => {
    expect(isTurnBoundaryEvent({ type: 'ready', protocolVersion: 1 })).toBe(false);
    expect(isTurnBoundaryEvent({ type: 'tool_call', name: 'x', args: {}, toolCallId: '1' })).toBe(
      false,
    );
  });
});

describe('HarnessSessionClient', () => {
  afterEach(() => {
    mockChild?.removeAllListeners();
    getMockStdout().removeAllListeners();
    getMockStdin().removeAllListeners();
  });

  function emitStdoutEvent(event: HarnessEvent): void {
    getMockStdout().write(`${JSON.stringify(event)}\n`);
  }

  it('resolves waitReady after a ready event', async () => {
    const client = new HarnessSessionClient();

    const ready = client.waitReady();
    emitStdoutEvent({ type: 'ready', protocolVersion: 1 });

    await expect(ready).resolves.toBeUndefined();
  });

  it('resolves waitForTurn on agent_response', async () => {
    const client = new HarnessSessionClient();
    emitStdoutEvent({ type: 'ready', protocolVersion: 1 });
    await client.waitReady();

    const turn = client.waitForTurn();
    emitStdoutEvent({
      type: 'agent_response',
      content: 'done',
      iterations: 1,
      tokenUsage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });

    await expect(turn).resolves.toMatchObject({ type: 'agent_response', content: 'done' });
  });

  it('sendCommand writes a user_command to stdin', async () => {
    const client = new HarnessSessionClient();
    const stdinChunks: string[] = [];
    getMockStdin().on('data', (chunk) => stdinChunks.push(chunk.toString()));

    client.sendCommand('turn off lights');

    expect(stdinChunks.join('')).toBe('{"type":"user_command","command":"turn off lights"}\n');
  });

  it('cancelTurn and shutdown write the expected commands', async () => {
    const client = new HarnessSessionClient();
    const stdinChunks: string[] = [];
    getMockStdin().on('data', (chunk) => stdinChunks.push(chunk.toString()));

    client.cancelTurn();
    client.shutdown();

    expect(stdinChunks.join('')).toBe(
      '{"type":"cancel"}\n{"type":"cancel"}\n{"type":"shutdown"}\n',
    );
  });

  it('notifies onSessionEnded after session_end', async () => {
    const client = new HarnessSessionClient();
    const ended = vi.fn();

    client.onSessionEnded(ended);
    emitStdoutEvent({ type: 'session_end', turnCount: 0 });

    expect(ended).toHaveBeenCalledOnce();
    expect(client.hasSessionEnded()).toBe(true);
  });

  it('calls onSessionEnded immediately when session already ended', async () => {
    const client = new HarnessSessionClient();
    emitStdoutEvent({ type: 'session_end', turnCount: 0 });

    const ended = vi.fn();
    client.onSessionEnded(ended);

    expect(ended).toHaveBeenCalledOnce();
  });

  it('forwards events to onEvent listeners', async () => {
    const client = new HarnessSessionClient();
    const events: HarnessEvent[] = [];
    const unsubscribe = client.onEvent((event) => events.push(event));

    emitStdoutEvent({ type: 'ready', protocolVersion: 1 });
    emitStdoutEvent({ type: 'error', message: 'boom' });
    unsubscribe();
    emitStdoutEvent({ type: 'session_end', turnCount: 0 });

    expect(events).toEqual([
      { type: 'ready', protocolVersion: 1 },
      { type: 'error', message: 'boom' },
    ]);
  });

  it('resolves waitForTurn with process exit error when child closes', async () => {
    const client = new HarnessSessionClient();

    const turn = client.waitForTurn();
    mockChild.emit('close', 1);

    await expect(turn).resolves.toEqual({
      type: 'error',
      message: 'Harness process exited.',
    });
    expect(client.hasSessionEnded()).toBe(true);
  });

  it('waitForExit returns the child exit code after stdout ends', async () => {
    const client = new HarnessSessionClient();

    getMockStdout().end();
    mockChild.exitCode = 0;
    mockChild.emit('close', 0);

    await expect(client.waitForExit()).resolves.toBe(0);
  });
});
