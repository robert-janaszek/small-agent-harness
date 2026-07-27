import type { HarnessEvent } from '../../../cli/jsonl';
import type { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { colors } from '../../../cli/tui/colors';

export const PARSE_PANEL_MIN_WIDTH = 28;

export type ParseStatusState = {
  errorCount: number | null;
  ok: boolean;
  errors: string[];
  undoHint: string | null;
};

export function createParseStatusState(): ParseStatusState {
  return {
    errorCount: null,
    ok: false,
    errors: [],
    undoHint: null,
  };
}

export function resetParseStatusState(state: ParseStatusState): void {
  state.errorCount = null;
  state.ok = false;
  state.errors = [];
  state.undoHint = null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  if (max <= 1) {
    return '…';
  }
  return `${text.slice(0, max - 1)}…`;
}

function extractUndoHint(content: string): string | null {
  const match = content.match(/\n\nErrors increased from \d+ to \d+\..+$/s);
  return match ? match[0].trim() : null;
}

function extractErrorBlocks(content: string): string[] {
  const marker = 'Fix these issues:\n\n';
  const start = content.indexOf(marker);
  if (start === -1) {
    return [];
  }

  let body = content.slice(start + marker.length);
  const undoIndex = body.indexOf('\n\nErrors increased');
  if (undoIndex !== -1) {
    body = body.slice(0, undoIndex);
  }

  const truncatedIndex = body.indexOf('\n\n… and ');
  if (truncatedIndex !== -1) {
    body = body.slice(0, truncatedIndex);
  }

  return body
    .split('\n\n')
    .map((block) => block.replace(/\s+/g, ' ').trim())
    .filter((block) => /^\d+\./.test(block));
}

export function applyYamlParseResult(state: ParseStatusState, content: string): void {
  if (content.startsWith('The YAML file parsed successfully')) {
    state.errorCount = 0;
    state.ok = true;
    state.errors = [];
    state.undoHint = null;
    return;
  }

  const errorMatch = content.match(/\((\d+) error\(s\)\)/);
  state.errorCount = errorMatch ? Number.parseInt(errorMatch[1]!, 10) : null;
  state.ok = false;
  state.errors = extractErrorBlocks(content);
  state.undoHint = extractUndoHint(content);
}

export function applyParseStatusEvent(state: ParseStatusState, event: HarnessEvent): void {
  if (event.type === 'context_init') {
    resetParseStatusState(state);
    return;
  }

  if (event.type === 'tool_result' && event.name === 'yamlParse') {
    applyYamlParseResult(state, event.content);
  }
}

function formatCountLabel(state: ParseStatusState): string {
  if (state.errorCount === null) {
    return '—';
  }

  if (state.ok) {
    return 'OK';
  }

  const noun = state.errorCount === 1 ? 'error' : 'errors';
  return `${state.errorCount} ${noun}`;
}

export function renderParseStatusLines(state: ParseStatusState, maxLines: number, width: number): string[] {
  if (maxLines <= 0 || width <= 0) {
    return [];
  }

  const lines: string[] = [
    truncate('Parse status', width),
    truncate('─'.repeat(Math.min(width, 24)), width),
    truncate(formatCountLabel(state), width),
  ];

  if (state.errorCount === null) {
    lines.push(truncate('Awaiting first yamlParse…', width));
    return lines.slice(0, maxLines);
  }

  if (state.ok) {
    lines.push(truncate('File parses cleanly.', width));
    return lines.slice(0, maxLines);
  }

  if (state.errors.length > 0) {
    lines.push(truncate('Latest errors:', width));
    for (const error of state.errors) {
      lines.push(truncate(`• ${error}`, width));
    }
  }

  if (state.undoHint) {
    lines.push(truncate('Undo recommended', width));
  }

  return lines.slice(0, maxLines);
}

export function paintParseStatusPanel(
  terminal: DiffTerminal,
  startCol: number,
  width: number,
  maxRows: number,
  state: ParseStatusState,
): void {
  const lines = renderParseStatusLines(state, maxRows, width);

  for (let row = 0; row < maxRows; row++) {
    const text = lines[row] ?? '';
    for (let col = 0; col < width; col++) {
      const ch = text[col] ?? ' ';
      let fg = colors.text;

      if (row === 0) {
        fg = colors.banner;
      } else if (row === 2) {
        fg = state.ok ? colors.success : state.errorCount === null ? colors.text : colors.error;
      } else if (text.startsWith('•')) {
        fg = colors.error;
      } else if (text.startsWith('Undo')) {
        fg = colors.paletteFg;
      }

      terminal.setChar(row, startCol + col, ch, fg);
    }
  }
}
