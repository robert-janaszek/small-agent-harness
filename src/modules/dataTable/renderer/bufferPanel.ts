import { colors } from '../../../core/tui/colors';
import type { DiffTerminal } from '../../../core/tui/diffTerminal';
import { graphemes } from '../../../core/tui/unicode';
import type { DataTableStateSnapshot } from '../context';

function displayWidth(text: string): number {
  return graphemes(text).length;
}

function truncateLine(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }

  const chars = graphemes(text);
  if (chars.length <= width) {
    return chars.join('');
  }
  if (width === 1) {
    return '…';
  }

  return `${chars.slice(0, width - 1).join('')}…`;
}

export function renderBufferLines(snapshot: DataTableStateSnapshot, maxLines: number, width: number): string[] {
  if (maxLines <= 0 || width <= 0) {
    return [];
  }

  if (snapshot.rowCount === 0 && snapshot.columns.length === 0) {
    return [truncateLine('Waiting for buffer...', width)].slice(0, maxLines);
  }

  const size = `${snapshot.rowCount} rows x ${snapshot.columnCount} cols`;
  const lines: string[] = [
    truncateLine('Data buffer', width),
    '-'.repeat(Math.min(width, 24)),
    truncateLine(snapshot.sourceId || 'unknown', width),
    truncateLine(size, width),
  ];

  if (snapshot.window && snapshot.rowCount > 0) {
    const last = Math.min(snapshot.window.offset + snapshot.window.limit - 1, snapshot.rowCount);
    lines.push(truncateLine(`window ${snapshot.window.offset}-${last}`, width));
  }

  if (snapshot.columns.length > 0) {
    lines.push(formatColumnSummary(snapshot.columns, width));
  }

  if (snapshot.description.length > 0) {
    lines.push(truncateLine(snapshot.description, width));
  }

  return lines.slice(0, maxLines);
}

export function formatColumnSummary(columns: string[], width: number): string {
  if (columns.length === 0) {
    return truncateLine('Columns:', width);
  }

  const prefix = 'Columns: ';
  for (let count = columns.length; count >= 1; count--) {
    const extra = columns.length - count;
    const names = columns.slice(0, count).join(', ');
    const suffix = extra > 0 ? `, … (+${extra})` : '';
    const line = `${prefix}${names}${suffix}`;
    if (displayWidth(line) <= width || count === 1) {
      return truncateLine(line, width);
    }
  }

  return truncateLine(`${prefix}${columns[0]}`, width);
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
