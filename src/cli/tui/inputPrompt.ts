import { stdin } from 'node:process';

import type { AnsiColor, DiffTerminal, TrueColor } from './diffTerminal';

export const INPUT_PREFIX = '> ';
export const QUEUE_BANNER_COLOR: AnsiColor = 33;
export const COMMAND_PALETTE_FG: AnsiColor = 37;
export const COMMAND_PALETTE_BG: TrueColor = { r: 35, g: 90, b: 175 };

const CURSOR_ON_EMPTY = '\u2581';
const KEY_ENTER = '\r';
const KEY_NEWLINE = '\n';
const KEY_TAB = '\t';
const KEY_ESCAPE = '\u001b';
const KEY_BACKSPACE = '\u007f';
const KEY_BACKSPACE_CTRL_H = '\b';
const KEY_ARROW_LEFT = `${KEY_ESCAPE}[D`;
const KEY_ARROW_RIGHT = `${KEY_ESCAPE}[C`;
const CTRL_C_BYTE = 0x03;
const PRINTABLE_ASCII_MIN = 0x20;
const PRINTABLE_ASCII_MAX = 0x7f;

function isEnterKey(key: string): boolean {
  return key === KEY_ENTER || key === KEY_NEWLINE;
}

function isBackspaceKey(key: string): boolean {
  return key === KEY_BACKSPACE || key === KEY_BACKSPACE_CTRL_H;
}

function isEscapeSequence(key: string): boolean {
  return key.startsWith(KEY_ESCAPE);
}

function isPrintableAscii(byte: number): boolean {
  return byte >= PRINTABLE_ASCII_MIN && byte < PRINTABLE_ASCII_MAX;
}

export const SLASH_COMMANDS = ['/exit'] as const;

export type CommandPaletteState = {
  matches: readonly string[];
};

export type InputLineView = {
  line: string;
  cursorCol: number;
};

export type InputLineState = {
  value: string;
  cursor: number;
  active: boolean;
  commandPalette: CommandPaletteState | null;
};

export function getCommandPaletteMatches(value: string): string[] {
  if (!value.startsWith('/')) {
    return [];
  }

  return SLASH_COMMANDS.filter((command) => command.startsWith(value));
}

export function getCommandPaletteState(
  value: string,
  paletteDismissed: boolean,
): CommandPaletteState | null {
  if (paletteDismissed) {
    return null;
  }

  const matches = getCommandPaletteMatches(value);
  return matches.length > 0 ? { matches } : null;
}

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

export function paintCommandPalette(
  terminal: DiffTerminal,
  row: number,
  width: number,
  palette: CommandPaletteState,
): void {
  const text = ` ${palette.matches.join(' ')}`.padEnd(width).slice(0, width);

  for (let col = 0; col < width; col++) {
    const ch = text[col] ?? ' ';
    terminal.setChar(row, col, ch, ch === ' ' ? undefined : COMMAND_PALETTE_FG, undefined, COMMAND_PALETTE_BG);
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
  terminal.setChar(row, cursorCol, cursorChar === ' ' ? CURSOR_ON_EMPTY : cursorChar, cursorColor);
}

export class TerminalInputLine {
  private value = '';
  private cursor = 0;
  private active = false;
  private paletteDismissed = false;
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
      commandPalette: getCommandPaletteState(this.value, this.paletteDismissed),
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
    this.paletteDismissed = false;
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
    this.paletteDismissed = false;
    this.onUpdate();
  }

  private syncPaletteDismissed(): void {
    if (!this.value.startsWith('/') || this.value === '/') {
      this.paletteDismissed = false;
    }
  }

  private getVisiblePalette(): CommandPaletteState | null {
    return getCommandPaletteState(this.value, this.paletteDismissed);
  }

  private completeFirstPaletteMatch(): boolean {
    const palette = this.getVisiblePalette();
    if (!palette) {
      return false;
    }

    const completed = palette.matches[0]!;
    if (this.value === completed) {
      return false;
    }

    this.value = completed;
    this.cursor = this.value.length;
    this.onUpdate();
    return true;
  }

  private handleKey(chunk: Buffer): void {
    if (chunk.length === 1 && chunk[0] === CTRL_C_BYTE) {
      this.onInterrupt?.();
      return;
    }

    const key = chunk.toString();

    if (isEnterKey(key)) {
      const palette = this.getVisiblePalette();
      const submitValue = palette ? palette.matches[0]! : this.value.trim();
      this.value = '';
      this.cursor = 0;
      this.paletteDismissed = false;
      this.onUpdate();
      this.onSubmit?.(submitValue);
      return;
    }

    if (key === KEY_TAB) {
      this.completeFirstPaletteMatch();
      return;
    }

    if (key === KEY_ESCAPE) {
      const palette = this.getVisiblePalette();
      if (palette) {
        this.paletteDismissed = true;
        this.onUpdate();
      }
      return;
    }

    if (isBackspaceKey(key)) {
      if (this.cursor > 0) {
        this.value = `${this.value.slice(0, this.cursor - 1)}${this.value.slice(this.cursor)}`;
        this.cursor -= 1;
        this.syncPaletteDismissed();
        this.onUpdate();
      }
      return;
    }

    if (key === KEY_ARROW_LEFT) {
      if (this.cursor > 0) {
        this.cursor -= 1;
        this.onUpdate();
      }
      return;
    }

    if (key === KEY_ARROW_RIGHT) {
      if (this.cursor < this.value.length) {
        this.cursor += 1;
        this.onUpdate();
      }
      return;
    }

    if (isEscapeSequence(key)) {
      return;
    }

    if (chunk.every((byte) => isPrintableAscii(byte))) {
      this.value = `${this.value.slice(0, this.cursor)}${key}${this.value.slice(this.cursor)}`;
      this.cursor += key.length;
      this.syncPaletteDismissed();
      this.onUpdate();
    }
  }
}
