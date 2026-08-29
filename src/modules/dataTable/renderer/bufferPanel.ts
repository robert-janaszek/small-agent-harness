import { colors } from '../../../core/tui/colors';
import type { DiffTerminal } from '../../../core/tui/diffTerminal';
import { graphemes } from '../../../core/tui/unicode';
import type { DataTableStateSnapshot } from '../context';

function wrapText(text: string, width: number): string[] {
  if (width <= 0) {
    return [];
  }

  const words = text.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
      continue;
    }

    if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.length <= width) {
      wrapped.push(line);
      continue;
    }

    for (let index = 0; index < line.length; index += width) {
      wrapped.push(line.slice(index, index + width));
    }
  }

  return wrapped.length > 0 ? wrapped : [''];
}

export function renderBufferLines(snapshot: DataTableStateSnapshot, maxLines: number, width: number): string[] {
  if (maxLines <= 0 || width <= 0) {
    return [];
  }

  if (snapshot.rowCount === 0 && snapshot.columns.length === 0) {
    return wrapText('Waiting for buffer...', width).slice(0, maxLines);
  }

  const size = `${snapshot.rowCount} rows x ${snapshot.columnCount} cols`;
  const lines: string[] = [
    ...wrapText('Data buffer', width),
    '-'.repeat(Math.min(width, 24)),
    ...wrapText(snapshot.sourceId || 'unknown', width),
    ...wrapText(size, width),
  ];

  if (snapshot.columns.length > 0) {
    lines.push(...wrapText(`Columns: ${snapshot.columns.join(', ')}`, width));
  }

  return lines.slice(0, maxLines);
}

function lineColor(text: string, row: number): number {
  if (row === 0) {
    return colors.banner;
  }
  if (text.startsWith('Waiting')) {
    return colors.paletteFg;
  }
  return colors.text;
}

export function paintBufferPanel(
  terminal: DiffTerminal,
  startCol: number,
  width: number,
  maxRows: number,
  snapshot: DataTableStateSnapshot,
): void {
  const lines = renderBufferLines(snapshot, maxRows, width);

  for (let row = 0; row < maxRows; row++) {
    const text = lines[row] ?? '';
    const chars = graphemes(text);
    const fg = lineColor(text, row);

    for (let col = 0; col < width; col++) {
      terminal.setChar(row, startCol + col, chars[col] ?? ' ', fg);
    }
  }
}
