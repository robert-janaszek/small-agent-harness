import { colors } from './colors';
import type { TokenUsage } from '../protocol';

export type TokenCounterState = {
  usage: TokenUsage;
  iteration: number;
};

type TokenSegment = { text: string; fg?: number };

export const TOKEN_COUNT_FIELD_WIDTH = 5;
export const TOKEN_ITERATION_FIELD_WIDTH = 2;

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

function padCountField(value: string): string {
  return value.padStart(TOKEN_COUNT_FIELD_WIDTH, ' ');
}

function padIterationField(value: number): string {
  return String(value).padStart(TOKEN_ITERATION_FIELD_WIDTH, ' ');
}

export function tokenCounterSegments(state: TokenCounterState): TokenSegment[] {
  const { usage, iteration } = state;

  return [
    { text: '↑', fg: colors.tokenPrompt },
    { text: padCountField(formatCompactCount(usage.prompt_tokens)), fg: colors.tokenPrompt },
    { text: ' ' },
    { text: '↓', fg: colors.tokenCompletion },
    { text: padCountField(formatCompactCount(usage.completion_tokens)), fg: colors.tokenCompletion },
    { text: ' ' },
    { text: 'Σ', fg: colors.tokenTotal },
    { text: padCountField(formatCompactCount(usage.total_tokens)), fg: colors.tokenTotal },
    { text: ' ' },
    { text: '↻', fg: colors.tokenIteration },
    { text: padIterationField(iteration), fg: colors.tokenIteration },
  ];
}

export function formatTokenCounter(state: TokenCounterState | null): string {
  if (!state) {
    return '';
  }

  return tokenCounterSegments(state).map((segment) => segment.text).join('');
}
