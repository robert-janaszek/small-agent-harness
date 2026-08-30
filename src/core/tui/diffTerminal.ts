import { writeSync } from 'node:fs';

import { firstGrapheme, graphemes } from './unicode';

export type TrueColor = { r: number; g: number; b: number };

export type CharCell = { ch: string; fg?: number; bg?: number; trueColorFg?: TrueColor; trueColorBg?: TrueColor };

function writeStdoutSync(chunk: string): void {
  writeSync(process.stdout.fd, chunk);
}

function emptyCell(): CharCell {
  return { ch: ' ' };
}

function cellsEqual(a: CharCell, b: CharCell): boolean {
  return (
    a.ch === b.ch
    && a.fg === b.fg
    && a.bg === b.bg
    && a.trueColorFg?.r === b.trueColorFg?.r
    && a.trueColorFg?.g === b.trueColorFg?.g
    && a.trueColorFg?.b === b.trueColorFg?.b
    && a.trueColorBg?.r === b.trueColorBg?.r
    && a.trueColorBg?.g === b.trueColorBg?.g
    && a.trueColorBg?.b === b.trueColorBg?.b
  );
}

function createBuffer(rows: number, cols: number): CharCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => emptyCell()),
  );
}

function formatCell(cell: CharCell): string {
  const codes: string[] = [];
  if (cell.trueColorFg !== undefined) {
    codes.push(`38;2;${cell.trueColorFg.r};${cell.trueColorFg.g};${cell.trueColorFg.b}`);
  } else if (cell.fg !== undefined) {
    codes.push(String(cell.fg));
  }
  if (cell.bg !== undefined) {
    codes.push(String(cell.bg));
  }
  if (cell.trueColorBg !== undefined) {
    codes.push(`48;2;${cell.trueColorBg.r};${cell.trueColorBg.g};${cell.trueColorBg.b}`);
  }

  if (codes.length > 0) {
    return `\x1b[${codes.join(';')}m${cell.ch}\x1b[0m`;
  }

  return cell.ch;
}

export class DiffTerminal {
  private rows: number;
  private cols: number;
  private buffer: CharCell[][];
  private prev: CharCell[][] | null = null;
  private write: (chunk: string) => void;
  private active = false;

  constructor(rows: number, cols: number, write: (chunk: string) => void = writeStdoutSync) {
    this.rows = rows;
    this.cols = cols;
    this.buffer = createBuffer(rows, cols);
    this.write = write;
  }

  get height(): number {
    return this.rows;
  }

  get width(): number {
    return this.cols;
  }

  resize(rows: number, cols: number): void {
    this.rows = rows;
    this.cols = cols;
    this.buffer = createBuffer(rows, cols);
    this.prev = null;
  }

  setChar(
    row: number,
    col: number,
    ch: string,
    fg?: number,
    bg?: number,
    trueColorBg?: TrueColor,
    trueColorFg?: TrueColor,
  ): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;
    this.buffer[row][col] = { ch: firstGrapheme(ch), fg, bg, trueColorBg, trueColorFg };
  }

  fill(row: number, col: number, text: string, fg?: number, trueColorFg?: TrueColor): void {
    const chars = graphemes(text);
    for (let i = 0; i < chars.length; i++) {
      this.setChar(row, col + i, chars[i] ?? ' ', fg, undefined, undefined, trueColorFg);
    }
  }

  clear(): void {
    this.buffer = createBuffer(this.rows, this.cols);
  }

  enter(): void {
    if (this.active) return;
    this.write('\x1b[?1049h\x1b[?25l\x1b[H');
    this.active = true;
    this.prev = null;
  }

  leave(): void {
    if (!this.active) return;
    this.write('\x1b[0m\x1b[?25h\x1b[?1049l');
    this.active = false;
    this.prev = null;
  }

  flush(): void {
    const chunks: string[] = [];

    for (let row = 0; row < this.rows; row++) {
      const prevRow = this.prev?.[row];
      const nextRow = this.buffer[row];

      for (let col = 0; col < this.cols; col++) {
        const nextCell = nextRow[col] ?? emptyCell();
        const prevCell = prevRow?.[col] ?? null;

        if (prevCell !== null && cellsEqual(prevCell, nextCell) && this.prev !== null) {
          continue;
        }

        chunks.push(`\x1b[${row + 1};${col + 1}H${formatCell(nextCell)}`);
      }

      if (prevRow && prevRow.length > this.cols) {
        for (let col = this.cols; col < prevRow.length; col++) {
          chunks.push(`\x1b[${row + 1};${col + 1}H `);
        }
      }
    }

    if (this.prev && this.prev.length > this.rows) {
      for (let row = this.rows; row < this.prev.length; row++) {
        chunks.push(`\x1b[${row + 1};1H\x1b[2K`);
      }
    }

    if (chunks.length > 0) {
      this.write(chunks.join(''));
    }

    this.prev = this.buffer.map((row) => row.map((cell) => ({ ...cell })));
  }
}
