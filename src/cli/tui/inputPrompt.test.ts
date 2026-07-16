import { describe, it, expect, vi, afterEach } from 'vitest';

import { getInputLineView, INPUT_PREFIX, TerminalInputLine } from './inputPrompt';

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

describe('TerminalInputLine.block', () => {
  const originalIsTTY = process.stdin.isTTY;
  const originalSetRawMode = process.stdin.setRawMode;

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    process.stdin.setRawMode = originalSetRawMode;
    process.stdin.removeAllListeners('data');
  });

  it('swallows keystrokes while blocked', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const setRawMode = vi.fn();
    process.stdin.setRawMode = setRawMode as typeof process.stdin.setRawMode;

    const input = new TerminalInputLine(() => undefined);
    input.block();

    expect(setRawMode).toHaveBeenCalledWith(true);
    expect(input.isBlocked()).toBe(true);

    process.stdin.emit('data', Buffer.from('hello'));
    expect(input.getState().value).toBe('');

    input.unblock();
    expect(setRawMode).toHaveBeenLastCalledWith(false);
  });

  it('calls onInterrupt for ctrl+c while blocked', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    process.stdin.setRawMode = vi.fn() as typeof process.stdin.setRawMode;

    const onInterrupt = vi.fn();
    const input = new TerminalInputLine(() => undefined);
    input.setOnInterrupt(onInterrupt);
    input.block();

    process.stdin.emit('data', Buffer.from([3]));

    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });
});
