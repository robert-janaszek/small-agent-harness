import { stdin } from 'node:process';

import type { AnsiColor, DiffTerminal } from './diffTerminal';

export const INPUT_PREFIX = '> ';
export const QUEUE_BANNER_COLOR: AnsiColor = 33;

export type InputLineView = {
  line: string;
  cursorCol: number;
};

export type InputLineState = {
  value: string;
  cursor: number;
  active: boolean;
};

export function formatQueueBanner(count: number): string {
  if (count <= 0) {
    return '';
  }

  return count === 1 ? '1 task pending' : `${count} tasks pending`;
}

export function paintQueueBanner(
  terminal: DiffTerminal,
  row: number,
  width: number,
  count: number,
): void {
  if (count <= 0) {
    return;
  }

  const text = formatQueueBanner(count);
  const line = text.padEnd(width).slice(0, width);

  for (let col = 0; col < line.length; col++) {
    const ch = line[col] ?? ' ';
    terminal.setChar(row, col, ch, ch === ' ' ? undefined : QUEUE_BANNER_COLOR);
  }
}

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
  const { line, cursorCol } = getInputLineView(state.value, state.cursor, width);
  terminal.fill(row, 0, line);

  if (!state.active) {
    return;
  }

  const cursorChar = line[cursorCol] ?? ' ';
  terminal.setChar(row, cursorCol, cursorChar === ' ' ? '▁' : cursorChar, cursorColor);
}

export class TerminalInputLine {
  private value = '';
  private cursor = 0;
  private active = false;
  private onSubmit: ((value: string) => void) | null = null;
  private onInterrupt: (() => void) | null = null;
  private readonly onUpdate: () => void;
  private readonly handleInputData: (chunk: Buffer) => void;

  constructor(onUpdate: () => void) {
    this.onUpdate = onUpdate;
    this.handleInputData = (chunk) => {
      this.handleKey(chunk);
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
    };
  }

  isActive(): boolean {
    return this.active;
  }

  start(onSubmit: (value: string) => void): void {
    if (this.active || !stdin.isTTY) {
      return;
    }

    this.active = true;
    this.onSubmit = onSubmit;
    this.value = '';
    this.cursor = 0;
    this.onUpdate();

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', this.handleInputData);
  }

  close(): void {
    if (!this.active) {
      return;
    }

    stdin.off('data', this.handleInputData);
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }

    this.active = false;
    this.onSubmit = null;
    this.value = '';
    this.cursor = 0;
    this.onUpdate();
  }

  private handleKey(chunk: Buffer): void {
    if (chunk.length === 1 && chunk[0] === 3) {
      this.onInterrupt?.();
      return;
    }

    const key = chunk.toString();

    if (key === '\r' || key === '\n') {
      const trimmed = this.value.trim();
      this.value = '';
      this.cursor = 0;
      this.onUpdate();
      this.onSubmit?.(trimmed);
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
}
