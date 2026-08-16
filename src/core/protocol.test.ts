import { describe, it, expect } from 'vitest';

import {
  CORE_PROTOCOL_VERSION,
  createStdoutEmit,
  encodeEvent,
  isCoreCommand,
  isModuleEvent,
  parseCommandLine,
} from './protocol';

describe('isCoreCommand', () => {
  it('accepts cancel, shutdown, and reset commands', () => {
    expect(isCoreCommand({ type: 'cancel' })).toBe(true);
    expect(isCoreCommand({ type: 'shutdown' })).toBe(true);
    expect(isCoreCommand({ type: 'reset' })).toBe(true);
  });

  it('accepts user_command with a string command field', () => {
    expect(isCoreCommand({ type: 'user_command', command: 'hello' })).toBe(true);
  });

  it('rejects invalid command shapes', () => {
    expect(isCoreCommand(null)).toBe(false);
    expect(isCoreCommand({})).toBe(false);
    expect(isCoreCommand({ type: 'unknown' })).toBe(false);
    expect(isCoreCommand({ type: 'user_command' })).toBe(false);
    expect(isCoreCommand({ type: 'user_command', command: 123 })).toBe(false);
    expect(isCoreCommand({ type: 'module', module: 'x', event: 'y' })).toBe(false);
  });
});

describe('isModuleEvent', () => {
  it('accepts a namespaced module envelope', () => {
    expect(isModuleEvent({ type: 'module', module: 'echo', event: 'round_done' })).toBe(true);
    expect(
      isModuleEvent({ type: 'module', module: 'echo', event: 'round_done', payload: { ok: true } }),
    ).toBe(true);
  });

  it('rejects incomplete or core events', () => {
    expect(isModuleEvent({ type: 'ready', protocolVersion: 1 })).toBe(false);
    expect(isModuleEvent({ type: 'module' })).toBe(false);
    expect(isModuleEvent({ type: 'module', module: 'echo' })).toBe(false);
    expect(isModuleEvent({ type: 'module', module: 1, event: 'x' })).toBe(false);
  });
});

describe('encodeEvent', () => {
  it('serializes an event as JSON with a trailing newline', () => {
    const line = encodeEvent({ type: 'user_command', command: 'hello' });
    expect(line).toBe('{"type":"user_command","command":"hello"}\n');
  });

  it('serializes a module envelope without requiring a payload', () => {
    expect(encodeEvent({ type: 'module', module: 'echo', event: 'started' })).toBe(
      '{"type":"module","module":"echo","event":"started"}\n',
    );
  });
});

describe('parseCommandLine', () => {
  it('parses core commands', () => {
    expect(parseCommandLine('{"type":"user_command","command":"hello"}')).toEqual({
      type: 'user_command',
      command: 'hello',
    });
    expect(parseCommandLine('{"type":"shutdown"}')).toEqual({ type: 'shutdown' });
    expect(parseCommandLine('{"type":"cancel"}')).toEqual({ type: 'cancel' });
    expect(parseCommandLine('{"type":"reset"}')).toEqual({ type: 'reset' });
  });

  it('returns null for invalid input', () => {
    expect(parseCommandLine('not json')).toBeNull();
    expect(parseCommandLine('{"type":"module","module":"x","event":"y"}')).toBeNull();
    expect(parseCommandLine('')).toBeNull();
  });
});

describe('createStdoutEmit', () => {
  it('writes encoded events through the provided writer', () => {
    const lines: string[] = [];
    const emit = createStdoutEmit((line) => lines.push(line));

    emit({ type: 'ready', protocolVersion: CORE_PROTOCOL_VERSION });

    expect(lines).toEqual([`{"type":"ready","protocolVersion":${CORE_PROTOCOL_VERSION}}\n`]);
  });
});
