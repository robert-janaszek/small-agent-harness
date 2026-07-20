import { describe, it, expect } from 'vitest';

import { DiffTerminal } from './diffTerminal';

describe('DiffTerminal', () => {
  it('writes only changed cells on subsequent flush', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(3, 5, (chunk) => output.push(chunk));

    terminal.setChar(0, 0, 'A');
    terminal.flush();
    output.length = 0;

    terminal.setChar(0, 0, 'A');
    terminal.flush();
    expect(output.join('')).toBe('');

    terminal.setChar(1, 2, 'B');
    terminal.flush();
    expect(output.join('')).toBe('\x1b[2;3HB');
  });

  it('does not emit a full-screen clear sequence', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(2, 4, (chunk) => output.push(chunk));

    terminal.setChar(0, 0, 'X');
    terminal.setChar(1, 3, 'Y');
    terminal.flush();

    expect(output.join('')).not.toContain('\x1b[2J');
    expect(output.join('')).not.toContain('\x1b[3J');
  });

  it('clears trailing cells when a line shrinks', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(1, 6, (chunk) => output.push(chunk));

    terminal.fill(0, 0, 'HELLO');
    terminal.flush();
    output.length = 0;

    terminal.fill(0, 0, 'HI   ');
    terminal.flush();

    expect(output.join('')).toContain('\x1b[1;3H ');
    expect(output.join('')).toContain('\x1b[1;4H ');
  });

  it('writes styled cells with ANSI color codes', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(1, 3, (chunk) => output.push(chunk));

    terminal.setChar(0, 0, '●', 32);
    terminal.flush();

    expect(output.join('')).toContain('\x1b[32m●\x1b[0m');
  });

  it('writes styled cells with foreground and background codes', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(1, 3, (chunk) => output.push(chunk));

    terminal.setChar(0, 0, 'x', 37, 100);
    terminal.flush();

    expect(output.join('')).toContain('\x1b[37;100mx\x1b[0m');
  });

  it('writes styled cells with true-color background', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(1, 3, (chunk) => output.push(chunk));

    terminal.setChar(0, 0, 'x', 37, undefined, { r: 135, g: 206, b: 250 });
    terminal.flush();

    expect(output.join('')).toContain('\x1b[37;48;2;135;206;250mx\x1b[0m');
  });
});
