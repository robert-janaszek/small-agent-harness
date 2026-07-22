import { stdin } from 'node:process';

import type { DiffTerminal } from './diffTerminal';
import { colors } from './colors';

const CURSOR_ON_EMPTY = '\u2581';
const KEY_ENTER = '\r';
const KEY_NEWLINE = '\n';
const KEY_TAB = '\t';
const KEY_ESCAPE = '\u001b';
const KEY_BACKSPACE = '\u007f';
const KEY_BACKSPACE_CTRL_H = '\b';
const KEY_ARROW_LEFT = `${KEY_ESCAPE}[D`;
const KEY_ARROW_RIGHT = `${KEY_ESCAPE}[C`;
const KEY_ARROW_UP = `${KEY_ESCAPE}[A`;
const KEY_ARROW_DOWN = `${KEY_ESCAPE}[B`;
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
export const INPUT_PREFIX = '> ';

export const SLASH_COMMANDS = ['/clear', '/exit'] as const;

export type CommandPaletteState = {
  matches: readonly string[];
  selectedIndex: number;
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
  selectedIndex = 0,
): CommandPaletteState | null {
  if (paletteDismissed) {
    return null;
  }

  const matches = getCommandPaletteMatches(value);
  if (matches.length === 0) {
    return null;
  }

  const clampedIndex = Math.min(Math.max(0, selectedIndex), matches.length - 1);
  return { matches, selectedIndex: clampedIndex };
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
    terminal.setChar(row, col, ch, ch === ' ' ? undefined : colors.banner);
  }
}

export function paintCommandPalette(
  terminal: DiffTerminal,
  row: number,
  width: number,
  palette: CommandPaletteState,
): void {
  let col = 0;

  if (col < width) {
    terminal.setChar(row, col++, ' ');
  }

  for (let i = 0; i < palette.matches.length && col < width; i++) {
    const command = palette.matches[i]!;
    const selected = i === palette.selectedIndex;

    for (const ch of command) {
      if (col >= width) {
        break;
      }

      terminal.setChar(row, col++, ch, colors.paletteFg, undefined, selected ? colors.paletteBg : undefined);
    }

    if (col < width && i < palette.matches.length - 1) {
      terminal.setChar(row, col++, ' ');
    }
  }

  while (col < width) {
    terminal.setChar(row, col++, ' ');
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
  cursorColor = colors.cursor,
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
  private paletteSelectedIndex = 0;
  private lastPaletteMatchKey = '';
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
      commandPalette: getCommandPaletteState(this.value, this.paletteDismissed, this.paletteSelectedIndex),
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
    this.paletteSelectedIndex = 0;
    this.lastPaletteMatchKey = '';
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
    this.paletteSelectedIndex = 0;
    this.lastPaletteMatchKey = '';
    this.onUpdate();
  }

  private syncPaletteDismissed(): void {
    if (!this.value.startsWith('/') || this.value === '/') {
      this.paletteDismissed = false;
    }
  }

  private getVisiblePalette(): CommandPaletteState | null {
    return getCommandPaletteState(this.value, this.paletteDismissed, this.paletteSelectedIndex);
  }

  private syncPaletteSelection(): void {
    const matchKey = getCommandPaletteMatches(this.value).join('\0');
    if (matchKey !== this.lastPaletteMatchKey) {
      this.paletteSelectedIndex = 0;
      this.lastPaletteMatchKey = matchKey;
    }
  }

  private completeSelectedPaletteMatch(): boolean {
    const palette = this.getVisiblePalette();
    if (!palette) {
      return false;
    }

    const completed = palette.matches[palette.selectedIndex]!;
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
      const submitValue = palette ? palette.matches[palette.selectedIndex]! : this.value.trim();
      this.value = '';
      this.cursor = 0;
      this.paletteDismissed = false;
      this.paletteSelectedIndex = 0;
      this.lastPaletteMatchKey = '';
      this.onUpdate();
      this.onSubmit?.(submitValue);
      return;
    }

    if (key === KEY_TAB) {
      this.completeSelectedPaletteMatch();
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
        this.syncPaletteSelection();
        this.onUpdate();
      }
      return;
    }

    if (key === KEY_ARROW_UP || key === KEY_ARROW_DOWN) {
      const palette = this.getVisiblePalette();
      if (palette && palette.matches.length > 1) {
        const delta = key === KEY_ARROW_DOWN ? 1 : -1;
        const len = palette.matches.length;
        this.paletteSelectedIndex = (palette.selectedIndex + delta + len) % len;
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
      this.syncPaletteSelection();
      this.onUpdate();
    }
  }
}
