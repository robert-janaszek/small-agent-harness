import { afterEach, describe, expect, it, vi } from 'vitest';

const harnessMocks = vi.hoisted(() => ({
  startSession: vi.fn(),
  run: vi.fn().mockResolvedValue({
    content: 'done',
    tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    iterations: 1,
  }),
  endSession: vi.fn(),
}));

vi.mock('./harness', () => ({
  Harness: class {
    startSession = harnessMocks.startSession;
    run = harnessMocks.run;
    endSession = harnessMocks.endSession;
  },
}));

vi.mock('../observability/langfuse', () => ({
  initLangfuseTracing: vi.fn(),
  flushLangfuse: vi.fn().mockResolvedValue(undefined),
}));

import { parseRunArgv, resolveHostMode, run } from './run';

describe('parseRunArgv', () => {
  it('joins remaining args as the user command', () => {
    expect(parseRunArgv(['turn', 'off', 'all', 'lights'])).toEqual({
      serve: false,
      jsonl: false,
      help: false,
      useDefault: false,
      command: 'turn off all lights',
    });
  });

  it('strips host flags so they never become part of the command', () => {
    expect(parseRunArgv(['--jsonl', 'turn', 'off', 'lights'])).toEqual({
      serve: false,
      jsonl: true,
      help: false,
      useDefault: false,
      command: 'turn off lights',
    });
    expect(parseRunArgv(['--serve', 'ignored'])).toEqual({
      serve: true,
      jsonl: false,
      help: false,
      useDefault: false,
      command: 'ignored',
    });
  });

  it('rejects unknown flags instead of treating them as the command', () => {
    expect(() => parseRunArgv(['--human'])).toThrow('Unknown flag: --human');
    expect(() => parseRunArgv(['--jsonl', '--human'])).toThrow('Unknown flag: --human');
  });

  it('rejects --default combined with a custom command or --serve', () => {
    expect(() => parseRunArgv(['--default', 'repair now'])).toThrow(
      '`--default` cannot be combined with a custom command.',
    );
    expect(() => parseRunArgv(['--serve', '--default'])).toThrow(
      '`--serve` cannot be combined with `--default`.',
    );
  });

  it('accepts --default as a host flag', () => {
    expect(parseRunArgv(['--jsonl', '--default'])).toEqual({
      serve: false,
      jsonl: true,
      help: false,
      useDefault: true,
      command: '',
    });
  });
});

describe('resolveHostMode', () => {
  it('keeps TUI on a TTY when jsonl is not requested', () => {
    expect(
      resolveHostMode(parseRunArgv(['turn', 'off', 'lights']), { tty: true }),
    ).toEqual({ mode: 'tui', command: 'turn off lights' });
  });

  it('waits in TUI when there is no command and no defaultCommand', () => {
    expect(resolveHostMode(parseRunArgv([]), { tty: true })).toEqual({
      mode: 'tui',
      command: '',
    });
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

  it('applies defaultCommand when provided and no positional command is set', () => {
    expect(
      resolveHostMode(parseRunArgv(['--jsonl']), { tty: true, defaultCommand: 'repair all' }),
    ).toEqual({ mode: 'jsonl-batch', command: 'repair all' });
    expect(
      resolveHostMode(parseRunArgv(['--default']), { tty: true, defaultCommand: 'repair all' }),
    ).toEqual({ mode: 'tui', command: 'repair all' });
  });

  it('rejects --default when the module has no defaultCommand', () => {
    expect(() => resolveHostMode(parseRunArgv(['--default']), { tty: true })).toThrow(
      '`--default` is not available for this module.',
    );
  });
});

describe('run JSONL batch', () => {
  afterEach(() => {
    harnessMocks.startSession.mockClear();
    harnessMocks.run.mockClear();
    harnessMocks.endSession.mockClear();
    harnessMocks.run.mockResolvedValue({
      content: 'done',
      tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      iterations: 1,
    });
  });

  it('emits session_end after a successful batch turn', async () => {
    const exitCode = await run({ argv: ['--jsonl', 'do', 'the', 'thing'] });

    expect(exitCode).toBe(0);
    expect(harnessMocks.startSession).toHaveBeenCalledOnce();
    expect(harnessMocks.run).toHaveBeenCalledWith('do the thing');
    expect(harnessMocks.endSession).toHaveBeenCalledOnce();
  });

  it('still ends the session when the batch turn throws', async () => {
    harnessMocks.run.mockRejectedValueOnce(new Error('boom'));
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      const exitCode = await run({ argv: ['--jsonl', 'do the thing'] });
      expect(exitCode).toBe(1);
      expect(harnessMocks.endSession).toHaveBeenCalledOnce();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it('returns 1 for unknown flags instead of sending them to the model', async () => {
    const chunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });

    try {
      const exitCode = await run({ argv: ['--human'] });
      expect(exitCode).toBe(1);
      expect(chunks.join('')).toContain('Unknown flag: --human');
      expect(harnessMocks.run).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});
