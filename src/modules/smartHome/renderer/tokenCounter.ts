import type { TokenUsage } from '../../../cli/jsonl';
import type { AnsiColor, DiffTerminal } from '../../../cli/tui/diffTerminal';

export type TokenCounterState = {
  usage: TokenUsage;
  iteration: number;
};

type TokenSegment = { text: string; fg?: AnsiColor };

export function formatCompactCount(n: number): string {
  if (n < 1000) {
    return String(n);
  }

  if (n < 1_000_000) {
    const thousands = n / 1000;
    if (thousands >= 100) {
      return `${Math.round(thousands)}k`;
    }
    return `${thousands.toFixed(1).replace(/\.0$/, '')}k`;
  }

  const millions = n / 1_000_000;
  if (millions >= 100) {
    return `${Math.round(millions)}M`;
  }
  return `${millions.toFixed(1).replace(/\.0$/, '')}M`;
}

export function tokenCounterSegments(state: TokenCounterState): TokenSegment[] {
  const { usage, iteration } = state;
  const prompt = formatCompactCount(usage.prompt_tokens);
  const completion = formatCompactCount(usage.completion_tokens);
  const total = formatCompactCount(usage.total_tokens);

  return [
    { text: '↑', fg: 36 },
    { text: prompt, fg: 36 },
    { text: '  ' },
    { text: '↓', fg: 33 },
    { text: completion, fg: 33 },
    { text: '  ' },
    { text: 'Σ', fg: 32 },
    { text: total, fg: 32 },
    { text: '  ' },
    { text: '↻', fg: 37 },
    { text: String(iteration), fg: 37 },
  ];
}

export function formatTokenCounter(state: TokenCounterState | null): string {
  if (!state) {
    return '';
  }

  return tokenCounterSegments(state).map((segment) => segment.text).join('');
}

export function paintTokenCounter(
  terminal: DiffTerminal,
  startCol: number,
  width: number,
  row: number,
  state: TokenCounterState | null,
): void {
  if (!state) {
    return;
  }

  const segments = tokenCounterSegments(state);
  const text = formatTokenCounter(state);
  let col = startCol + Math.max(0, width - text.length);

  for (const segment of segments) {
    for (const ch of segment.text) {
      terminal.setChar(row, col, ch, segment.fg);
      col += 1;
    }
  }
}
