import type { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { colors } from '../../../cli/tui/colors';
import { graphemes } from '../../../cli/tui/unicode';
import type { ParseStatusState, YamlRepairStateSnapshot } from '../context';

export type { ParseStatusState };

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

function formatCountLabel(state: ParseStatusState): string {
  if (state.errorCount === null) {
    return '-';
  }

  if (state.ok) {
    return 'OK';
  }

  const noun = state.errorCount === 1 ? 'error' : 'errors';
  return `${state.errorCount} ${noun}`;
}

export function renderParseStatusLines(
  state: ParseStatusState,
  maxLines: number,
  width: number,
  filePath = '',
): string[] {
  if (maxLines <= 0 || width <= 0) {
    return [];
  }

  const undoLines = state.undoHint ? wrapText('Undo recommended', width) : [];
  const budget = Math.max(0, maxLines - undoLines.length);

  const lines: string[] = [
    ...wrapText('Parse status', width),
    '-'.repeat(Math.min(width, 24)),
  ];

  if (filePath.length > 0) {
    lines.push(...wrapText(filePath, width));
  }

  lines.push(...wrapText(formatCountLabel(state), width));

  if (state.errorCount === null) {
    lines.push(...wrapText('Awaiting first yamlParse...', width));
    return [...lines, ...undoLines].slice(0, maxLines);
  }

  if (state.ok) {
    lines.push(...wrapText('File parses cleanly.', width));
    return [...lines, ...undoLines].slice(0, maxLines);
  }

  if (state.errors.length > 0) {
    lines.push(...wrapText('Latest errors:', width));
    for (const error of state.errors) {
      lines.push(...wrapText(`* ${error}`, width));
    }
  }

  return [...lines.slice(0, budget), ...undoLines].slice(0, maxLines);
}

function lineColor(text: string, row: number, state: ParseStatusState): number {
  if (row === 0) {
    return colors.banner;
  }
  if (text.startsWith('*')) {
    return colors.error;
  }
  if (text.startsWith('Undo')) {
    return colors.paletteFg;
  }
  if (text === 'OK' || text === 'File parses cleanly.') {
    return colors.success;
  }
  if (/^\d+ errors?$/.test(text)) {
    return colors.error;
  }
  return colors.text;
}

export function paintParseStatusPanel(
  terminal: DiffTerminal,
  startCol: number,
  width: number,
  maxRows: number,
  snapshot: Pick<YamlRepairStateSnapshot, 'filePath' | 'parseStatus'>,
): void {
  const lines = renderParseStatusLines(snapshot.parseStatus, maxRows, width, snapshot.filePath);

  for (let row = 0; row < maxRows; row++) {
    const text = lines[row] ?? '';
    const chars = graphemes(text);
    const fg = lineColor(text, row, snapshot.parseStatus);

    for (let col = 0; col < width; col++) {
      terminal.setChar(row, startCol + col, chars[col] ?? ' ', fg);
    }
  }
}
