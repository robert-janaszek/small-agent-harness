export type CharCell = { ch: string };

function emptyCell(): CharCell {
  return { ch: ' ' };
}

function createBuffer(rows: number, cols: number): CharCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => emptyCell()),
  );
}

export class DiffTerminal {
  private rows: number;
  private cols: number;
  private buffer: CharCell[][];
  private prev: CharCell[][] | null = null;
  private write: (chunk: string) => void;
  private active = false;

  constructor(rows: number, cols: number, write: (chunk: string) => void = process.stdout.write.bind(process.stdout)) {
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

  setChar(row: number, col: number, ch: string): void {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;
    this.buffer[row][col] = { ch: ch.slice(0, 1) || ' ' };
  }

  fill(row: number, col: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.setChar(row, col + i, text[i] ?? ' ');
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
    this.write('\x1b[?1049l\x1b[?25h');
    this.active = false;
    this.prev = null;
  }

  flush(): void {
    const chunks: string[] = [];

    for (let row = 0; row < this.rows; row++) {
      const prevRow = this.prev?.[row];
      const nextRow = this.buffer[row];

      for (let col = 0; col < this.cols; col++) {
        const nextCh = nextRow[col]?.ch ?? ' ';
        const prevCh = prevRow?.[col]?.ch ?? null;

        if (prevCh === nextCh && this.prev !== null) {
          continue;
        }

        chunks.push(`\x1b[${row + 1};${col + 1}H${nextCh}`);
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
