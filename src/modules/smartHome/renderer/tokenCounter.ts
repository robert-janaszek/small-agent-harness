import type { TokenUsage } from '../../../cli/jsonl';
import type { DiffTerminal } from '../../../cli/tui/diffTerminal';

export type TokenCounterState = {
  usage: TokenUsage;
  iteration: number;
};

export function formatTokenCounter(state: TokenCounterState | null): string {
  if (!state) {
    return '';
  }

  const { usage, iteration } = state;
  return `↑${usage.prompt_tokens} ↓${usage.completion_tokens} Σ${usage.total_tokens} ↻${iteration}`;
}

export function paintTokenCounter(
  terminal: DiffTerminal,
  startCol: number,
  width: number,
  row: number,
  state: TokenCounterState | null,
): void {
  const text = formatTokenCounter(state);
  if (!text) {
    return;
  }

  const col = startCol + Math.max(0, width - text.length);
  for (let i = 0; i < text.length; i++) {
    terminal.setChar(row, col + i, text[i] ?? ' ', 90);
  }
}
