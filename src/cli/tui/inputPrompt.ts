import { stdin } from 'node:process';

import type { AnsiColor, DiffTerminal } from './diffTerminal';

export const INPUT_PREFIX = '> ';

export type InputLineView = {
  line: string;
  cursorCol: number;
};

export type InputLineState = {
  value: string;
  cursor: number;
  active: boolean;
  blocked: boolean;
};

export function getInputLineView(value: string, cursor: number, width: number): InputLineView {
  const prefix = INPUT_PREFIX;
  const maxInputWidth = Math.max(0, width - prefix.length);
  let visible = value;
  let visibleCursor = cursor;

  if (visible.length > maxInputWidth) {
    const scrollStart = Math.max(0, Math.min(cursor - maxInputWidth + 1, value.length - maxInputWidth));
    visible = value.slice(scrollStart, scrollStart + maxInputWidth);
    visibleCursor = cursor - scrollStart;
  }

  const line = (prefix + visible).padEnd(width).slice(0, width);
  const cursorCol = Math.min(prefix.length + visibleCursor, width - 1);

  return { line, cursorCol };
}

export function paintInputLine(
  terminal: DiffTerminal,
  row: number,
  width: number,
  state: InputLineState,
  cursorColor: AnsiColor = 36,
): void {
  const displayValue = state.blocked ? '' : state.value;
  const { line, cursorCol } = getInputLineView(displayValue, state.blocked ? 0 : state.cursor, width);
  terminal.fill(row, 0, line);

  if (!state.active || state.blocked) {
    return;
  }

  const cursorChar = line[cursorCol] ?? ' ';
  terminal.setChar(row, cursorCol, cursorChar === ' ' ? '▁' : cursorChar, cursorColor);
}

export class TerminalInputLine {
  private value = '';
  private cursor = 0;
  private active = false;
  private blocked = false;
  private resolve: ((value: string | null) => void) | null = null;
  private onInterrupt: (() => void) | null = null;
  private readonly onUpdate: () => void;
  private readonly handleInputData: (chunk: Buffer) => void;
  private readonly handleBlockedData: (chunk: Buffer) => void;

  constructor(onUpdate: () => void) {
    this.onUpdate = onUpdate;
    this.handleInputData = (chunk) => {
      this.handleKey(chunk);
    };
    this.handleBlockedData = (chunk) => {
      if (chunk.length === 1 && chunk[0] === 3) {
        this.onInterrupt?.();
      }
    };
  }

  setOnInterrupt(handler: (() => void) | null): void {
    this.onInterrupt = handler;
  }

  getState(): InputLineState {
    return {
      value: this.value,
      cursor: this.cursor,
      active: this.active,
      blocked: this.blocked,
    };
  }

  isActive(): boolean {
    return this.active;
  }

  isBlocked(): boolean {
    return this.blocked;
  }

  block(): void {
    if (this.blocked || !stdin.isTTY || this.active) {
      return;
    }

    this.blocked = true;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', this.handleBlockedData);
    this.onUpdate();
  }

  unblock(): void {
    if (!this.blocked || this.active) {
      return;
    }

    this.blocked = false;
    stdin.off('data', this.handleBlockedData);
    stdin.setRawMode(false);
    this.onUpdate();
  }

  async readLine(): Promise<string | null> {
    if (this.active || this.blocked || !stdin.isTTY) {
      return null;
    }

    this.active = true;
    this.value = '';
    this.cursor = 0;
    this.onUpdate();

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', this.handleInputData);

    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  close(): void {
    if (this.active) {
      this.finish(null);
    }
    if (this.blocked) {
      this.unblock();
    }
  }

  private handleKey(chunk: Buffer): void {
    if (chunk.length === 1 && chunk[0] === 3) {
      this.finish(null);
      return;
    }

    const key = chunk.toString();

    if (key === '\r' || key === '\n') {
      this.finish(this.value.trim());
      return;
    }

    if (key === '\u007f' || key === '\b') {
      if (this.cursor > 0) {
        this.value = `${this.value.slice(0, this.cursor - 1)}${this.value.slice(this.cursor)}`;
        this.cursor -= 1;
        this.onUpdate();
      }
      return;
    }

    if (key === '\u001b[D') {
      if (this.cursor > 0) {
        this.cursor -= 1;
        this.onUpdate();
      }
      return;
    }

    if (key === '\u001b[C') {
      if (this.cursor < this.value.length) {
        this.cursor += 1;
        this.onUpdate();
      }
      return;
    }

    if (key.startsWith('\u001b')) {
      return;
    }

    if (chunk.every((byte) => byte >= 32 && byte < 127)) {
      this.value = `${this.value.slice(0, this.cursor)}${key}${this.value.slice(this.cursor)}`;
      this.cursor += key.length;
      this.onUpdate();
    }
  }

  private finish(result: string | null): void {
    stdin.off('data', this.handleInputData);
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }

    this.active = false;
    this.value = '';
    this.cursor = 0;
    this.onUpdate();

    const resolve = this.resolve;
    this.resolve = null;
    resolve?.(result);
  }
}
