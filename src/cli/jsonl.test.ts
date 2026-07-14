import { describe, it, expect, afterEach } from 'vitest';

import { emit, resetEmitWriter, setEmitWriter } from './jsonl';

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
