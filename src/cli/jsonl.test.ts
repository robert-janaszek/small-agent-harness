import { describe, it, expect, afterEach } from 'vitest';

import { emit, isHarnessCommand, resetEmitWriter, setEmitWriter } from './jsonl';

describe('isHarnessCommand', () => {
  it('accepts cancel and shutdown commands', () => {
    expect(isHarnessCommand({ type: 'cancel' })).toBe(true);
    expect(isHarnessCommand({ type: 'shutdown' })).toBe(true);
  });

  it('accepts user_command with a string command field', () => {
    expect(isHarnessCommand({ type: 'user_command', command: 'hello' })).toBe(true);
  });

  it('rejects invalid command shapes', () => {
    expect(isHarnessCommand(null)).toBe(false);
    expect(isHarnessCommand({})).toBe(false);
    expect(isHarnessCommand({ type: 'unknown' })).toBe(false);
    expect(isHarnessCommand({ type: 'user_command' })).toBe(false);
    expect(isHarnessCommand({ type: 'user_command', command: 123 })).toBe(false);
  });
});

describe('emit', () => {
  afterEach(() => {
    resetEmitWriter();
  });

  it('serializes an event as JSON with a trailing newline', () => {
    const lines: string[] = [];
    setEmitWriter((line) => lines.push(line));

    emit({ type: 'user_command', command: 'turn off lights' });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('{"type":"user_command","command":"turn off lights"}\n');
    expect(JSON.parse(lines[0].trimEnd())).toEqual({
      type: 'user_command',
      command: 'turn off lights',
    });
  });
});
