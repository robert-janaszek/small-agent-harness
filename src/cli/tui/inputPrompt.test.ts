import { describe, it, expect, vi, afterEach } from 'vitest';

import { formatQueueBanner, getInputLineView, INPUT_PREFIX, TerminalInputLine } from './inputPrompt';

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

describe('TerminalInputLine.start', () => {
  const originalIsTTY = process.stdin.isTTY;
  const originalSetRawMode = process.stdin.setRawMode;

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    process.stdin.setRawMode = originalSetRawMode;
    process.stdin.removeAllListeners('data');
  });

  it('accumulates keystrokes and submits on Enter', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;

    const onSubmit = vi.fn();
    const input = new TerminalInputLine(() => undefined);
    input.start(onSubmit);

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
});
