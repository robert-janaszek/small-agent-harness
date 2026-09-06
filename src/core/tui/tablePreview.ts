import { graphemes } from './unicode';

export const EXPORT_PREVIEW_MAX_ROWS = 15;

const MIN_CELL_WIDTH = 8;
const COL_GAP = 1;

export type TablePreviewSource = {
  columns: string[];
  rows: Array<Record<string, unknown>>;
};

export function parseExportTable(payload: unknown): TablePreviewSource | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.columns) || !record.columns.every((column) => typeof column === 'string')) {
    return null;
  }
  if (!Array.isArray(record.rows)) {
    return null;
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const row of record.rows) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      rows.push({});
      continue;
    }
    rows.push(row as Record<string, unknown>);
  }

  return { columns: record.columns, rows };
}

export function formatTablePreview(source: TablePreviewSource, width: number): string[] {
  if (width <= 0) {
    return [];
  }

  const totalRows = source.rows.length;
  const totalCols = source.columns.length;
  const shownRows = source.rows.slice(0, EXPORT_PREVIEW_MAX_ROWS);
  const shownRowCount = shownRows.length;
  const rowsTruncated = shownRowCount < totalRows;

  const fitted = fitColumns(source.columns, width);
  const colsTruncated = fitted.names.length < totalCols;
  const header = formatExportHeader({
    shownRows: shownRowCount,
    totalRows,
    shownCols: fitted.names.length,
    totalCols,
    rowsTruncated,
    colsTruncated,
  });

  const lines = [clipLine(header, width)];
  if (fitted.names.length === 0) {
    return lines;
  }

  const extraCols = totalCols - fitted.names.length;
  lines.push(clipLine(formatAlignedRow(fitted.names, fitted.widths, extraCols), width));
  for (const row of shownRows) {
    const cells = fitted.names.map((column) => cellText(row[column]));
    lines.push(clipLine(formatAlignedRow(cells, fitted.widths, 0), width));
  }

  return lines;
}

function formatExportHeader(stats: {
  shownRows: number;
  totalRows: number;
  shownCols: number;
  totalCols: number;
  rowsTruncated: boolean;
  colsTruncated: boolean;
}): string {
  if (!stats.rowsTruncated && !stats.colsTruncated) {
    return `exported ${stats.totalRows}/${stats.totalRows} rows`;
  }

  const rowPart = `${stats.shownRows}/${stats.totalRows} rows`;
  const colPart = stats.colsTruncated ? `, ${stats.shownCols}/${stats.totalCols} cols` : '';
  return `exported ${rowPart}${colPart} (truncated)`;
}

function fitColumns(
  columns: string[],
  width: number,
): { names: string[]; widths: number[] } {
  if (columns.length === 0) {
    return { names: [], widths: [] };
  }

  let count = 0;
  for (let n = 1; n <= columns.length; n++) {
    const extra = columns.length - n;
    const suffixLen = extra > 0 ? displayWidth(` … +${extra}`) : 0;
    const available = width - suffixLen;
    const minNeeded = n * MIN_CELL_WIDTH + (n - 1) * COL_GAP;
    if (n > 1 && available < minNeeded) {
      break;
    }
    count = n;
  }

  if (count === 0) {
    return { names: columns.slice(0, 1), widths: [Math.max(1, width)] };
  }

  const extra = columns.length - count;
  const suffixLen = extra > 0 ? displayWidth(` … +${extra}`) : 0;
  const available = Math.max(count, width - suffixLen);
  const inner = Math.max(count, available - (count - 1) * COL_GAP);
  const base = Math.floor(inner / count);
  const remainder = inner % count;
  const widths = Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));

  return { names: columns.slice(0, count), widths };
}

function formatAlignedRow(cells: string[], widths: number[], extraCols: number): string {
  const padded = cells.map((cell, index) => padTrunc(cell, widths[index] ?? MIN_CELL_WIDTH));
  const suffix = extraCols > 0 ? ` … +${extraCols}` : '';
  return `${padded.join(' ')}${suffix}`;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.replace(/\s+/g, ' ');
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function padTrunc(text: string, width: number): string {
  const chars = graphemes(text);
  if (chars.length <= width) {
    return `${chars.join('')}${' '.repeat(width - chars.length)}`;
  }
  if (width <= 1) {
    return '…'.slice(0, width);
  }
  return `${chars.slice(0, width - 1).join('')}…`;
}

function clipLine(text: string, width: number): string {
  const chars = graphemes(text);
  if (chars.length <= width) {
    return chars.join('');
  }
  if (width <= 1) {
    return '…'.slice(0, width);
  }
  return `${chars.slice(0, width - 1).join('')}…`;
}

function displayWidth(text: string): number {
  return graphemes(text).length;
}
