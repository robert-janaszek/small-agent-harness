import { describe, expect, it } from 'vitest';

import { parseRunArgv, resolveHostMode } from './run';

describe('parseRunArgv', () => {
  it('joins remaining args as the user command', () => {
    expect(parseRunArgv(['turn', 'off', 'all', 'lights'])).toEqual({
      serve: false,
      jsonl: false,
      help: false,
      command: 'turn off all lights',
    });
  });

  it('strips host flags so they never become part of the command', () => {
    expect(parseRunArgv(['--jsonl', 'turn', 'off', 'lights'])).toEqual({
      serve: false,
      jsonl: true,
      help: false,
      command: 'turn off lights',
    });
    expect(parseRunArgv(['--serve', 'ignored'])).toEqual({
      serve: true,
      jsonl: false,
      help: false,
      command: 'ignored',
    });
  });
});

describe('resolveHostMode', () => {
  it('keeps TUI on a TTY when jsonl is not requested', () => {
    expect(
      resolveHostMode(parseRunArgv(['turn', 'off', 'lights']), { tty: true }),
    ).toEqual({ mode: 'tui', command: 'turn off lights' });
  });

  it('forces one-shot JSONL on a TTY when --jsonl is set', () => {
    expect(
      resolveHostMode(parseRunArgv(['--jsonl', 'turn', 'off', 'lights']), { tty: true }),
    ).toEqual({ mode: 'jsonl-batch', command: 'turn off lights' });
  });

  it('uses JSONL batch on a non-TTY even without --jsonl', () => {
    expect(
      resolveHostMode(parseRunArgv(['turn', 'off', 'lights']), { tty: false }),
    ).toEqual({ mode: 'jsonl-batch', command: 'turn off lights' });
  });

  it('uses serve JSONL for --serve, empty --jsonl, or a non-TTY with no command', () => {
    expect(resolveHostMode(parseRunArgv(['--serve']), { tty: true })).toEqual({
      mode: 'jsonl-serve',
      command: '',
    });
    expect(resolveHostMode(parseRunArgv(['--jsonl']), { tty: true })).toEqual({
      mode: 'jsonl-serve',
      command: '',
    });
    expect(resolveHostMode(parseRunArgv([]), { tty: false })).toEqual({
      mode: 'jsonl-serve',
      command: '',
    });
  });

  it('--serve wins over a command and over --jsonl', () => {
    expect(
      resolveHostMode(parseRunArgv(['--jsonl', '--serve', 'turn', 'off']), { tty: true }),
    ).toEqual({ mode: 'jsonl-serve', command: '' });
  });
});
