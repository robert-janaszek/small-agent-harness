import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  formatQueueBanner,
  getCommandPaletteMatches,
  getCommandPaletteState,
  getInputLineView,
  INPUT_PREFIX,
  paintCommandPalette,
  TerminalInputLine,
} from './inputPrompt';
import { colors } from './colors';
import { DiffTerminal } from './diffTerminal';

describe('getInputLineView', () => {
  it('renders prefix and value with cursor after text', () => {
    const view = getInputLineView('hello', 5, 20);

    expect(view.line.startsWith(INPUT_PREFIX)).toBe(true);
    expect(view.line.trimEnd()).toBe(`${INPUT_PREFIX}hello`);
    expect(view.cursorCol).toBe(INPUT_PREFIX.length + 5);
  });

  it('scrolls long input to keep cursor visible', () => {
    const value = 'abcdefghijklmnopqrstuvwxyz';
    const view = getInputLineView(value, value.length, 12);

    expect(view.line.length).toBe(12);
    expect(view.cursorCol).toBe(11);
    expect(view.line.endsWith('z')).toBe(true);
  });
});

describe('formatQueueBanner', () => {
  it('returns empty string for zero tasks', () => {
    expect(formatQueueBanner(0)).toBe('');
  });

  it('uses singular form for one task', () => {
    expect(formatQueueBanner(1)).toBe('1 task pending');
  });

  it('uses plural form for multiple tasks', () => {
    expect(formatQueueBanner(2)).toBe('2 tasks pending');
  });
});

describe('getCommandPaletteMatches', () => {
  it('matches slash commands by prefix', () => {
    expect(getCommandPaletteMatches('/')).toEqual(['/exit']);
    expect(getCommandPaletteMatches('/ex')).toEqual(['/exit']);
    expect(getCommandPaletteMatches('/exit')).toEqual(['/exit']);
  });

  it('returns no matches for non-command input', () => {
    expect(getCommandPaletteMatches('/foo')).toEqual([]);
    expect(getCommandPaletteMatches('hello')).toEqual([]);
  });
});

describe('getCommandPaletteState', () => {
  it('returns matches when palette is not dismissed', () => {
    expect(getCommandPaletteState('/ex', false)).toEqual({ matches: ['/exit'] });
  });

  it('returns null when palette is dismissed', () => {
    expect(getCommandPaletteState('/ex', true)).toBeNull();
  });
});

describe('paintCommandPalette', () => {
  it('highlights the selected command with foreground and full-width light-blue background', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(1, 10, (chunk) => output.push(chunk));
    paintCommandPalette(terminal, 0, 10, { matches: ['/exit'] });
    terminal.flush();

    const rendered = output.join('');
    expect(rendered).toContain(`\x1b[${colors.paletteFg};48;2;${colors.paletteBg.r};${colors.paletteBg.g};${colors.paletteBg.b}m/\x1b[0m`);
    expect(rendered).toContain(`\x1b[48;2;${colors.paletteBg.r};${colors.paletteBg.g};${colors.paletteBg.b}m \x1b[0m`);
  });
});

describe('TerminalInputLine.start', () => {
  const originalIsTTY = process.stdin.isTTY;
  const originalSetRawMode = process.stdin.setRawMode;

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    process.stdin.setRawMode = originalSetRawMode;
    process.stdin.removeAllListeners('data');
  });

  function createInput(onSubmit = vi.fn()): { input: TerminalInputLine; onSubmit: ReturnType<typeof vi.fn> } {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;

    const onSubmitMock = onSubmit;
    const input = new TerminalInputLine(() => undefined);
    input.start(onSubmitMock);
    return { input, onSubmit: onSubmitMock };
  }

  it('accumulates keystrokes and submits on Enter', () => {
    const { input, onSubmit } = createInput();

    expect(process.stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(input.isActive()).toBe(true);

    process.stdin.emit('data', Buffer.from('hello'));
    expect(input.getState().value).toBe('hello');

    process.stdin.emit('data', Buffer.from('\r'));
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(input.getState().value).toBe('');
    expect(input.isActive()).toBe(true);
  });

  it('calls onInterrupt for ctrl+c', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;

    const onInterrupt = vi.fn();
    const input = new TerminalInputLine(() => undefined);
    input.setOnInterrupt(onInterrupt);
    input.start(() => undefined);

    process.stdin.emit('data', Buffer.from('draft'));
    process.stdin.emit('data', Buffer.from([3]));

    expect(onInterrupt).toHaveBeenCalledTimes(1);
    expect(input.getState().value).toBe('draft');
  });

  it('shows command palette for slash input', () => {
    const { input } = createInput();

    process.stdin.emit('data', Buffer.from('/ex'));

    expect(input.getState().commandPalette).toEqual({ matches: ['/exit'] });
  });

  it('completes the first match on Tab without submitting', () => {
    const { input, onSubmit } = createInput();

    process.stdin.emit('data', Buffer.from('/'));
    process.stdin.emit('data', Buffer.from('\t'));

    expect(input.getState().value).toBe('/exit');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the first palette match on Enter', () => {
    const { input, onSubmit } = createInput();

    process.stdin.emit('data', Buffer.from('/ex'));
    process.stdin.emit('data', Buffer.from('\r'));

    expect(onSubmit).toHaveBeenCalledWith('/exit');
  });

  it('submits the completed command after Tab then Enter', () => {
    const { input, onSubmit } = createInput();

    process.stdin.emit('data', Buffer.from('/'));
    process.stdin.emit('data', Buffer.from('\t'));
    process.stdin.emit('data', Buffer.from('\r'));

    expect(onSubmit).toHaveBeenCalledWith('/exit');
  });

  it('hides palette on ESC while keeping the typed value', () => {
    const { input, onSubmit } = createInput();

    process.stdin.emit('data', Buffer.from('/ex'));
    process.stdin.emit('data', Buffer.from('\u001b'));

    expect(input.getState().value).toBe('/ex');
    expect(input.getState().commandPalette).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('allows finishing a dismissed command manually and submitting it', () => {
    const { input, onSubmit } = createInput();

    process.stdin.emit('data', Buffer.from('/ex'));
    process.stdin.emit('data', Buffer.from('\u001b'));
    process.stdin.emit('data', Buffer.from('it'));
    process.stdin.emit('data', Buffer.from('\r'));

    expect(onSubmit).toHaveBeenCalledWith('/exit');
    expect(input.getState().commandPalette).toBeNull();
  });

  it('shows palette again after backing up to a lone slash', () => {
    const { input } = createInput();

    process.stdin.emit('data', Buffer.from('/ex'));
    process.stdin.emit('data', Buffer.from('\u001b'));
    process.stdin.emit('data', Buffer.from('\u007f'));
    process.stdin.emit('data', Buffer.from('\u007f'));

    expect(input.getState().value).toBe('/');
    expect(input.getState().commandPalette).toEqual({ matches: ['/exit'] });
  });
});
