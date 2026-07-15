import type { DiffTerminal } from '../../../cli/tui/diffTerminal';
import {
  ACTIVITY_SPINNER_WIDTH,
  activityFrame,
  paintActivitySpinnerSegments,
  paintSegments,
  STATUS_BAR_GAP,
} from './activitySpinner';
import { tokenCounterSegments, TOKEN_COUNT_FIELD_WIDTH, TOKEN_ITERATION_FIELD_WIDTH } from './tokenCounter';
import type { TokenCounterState } from './tokenCounter';

export const TOKEN_COUNTER_WIDTH =
  1 + TOKEN_COUNT_FIELD_WIDTH + 1 + 1 + TOKEN_COUNT_FIELD_WIDTH + 1 + 1 + TOKEN_COUNT_FIELD_WIDTH + 1 + 1 + TOKEN_ITERATION_FIELD_WIDTH;

export type StatusBarOptions = {
  tokenCounter: TokenCounterState | null;
  activityTick: number;
  activityActive: boolean;
};

export function statusBarWidth(tokenCounter: TokenCounterState | null): number {
  if (!tokenCounter) {
    return ACTIVITY_SPINNER_WIDTH;
  }

  return ACTIVITY_SPINNER_WIDTH + STATUS_BAR_GAP + TOKEN_COUNTER_WIDTH;
}

export function paintStatusBar(
  terminal: DiffTerminal,
  startCol: number,
  width: number,
  row: number,
  options: StatusBarOptions,
): void {
  const barWidth = statusBarWidth(options.tokenCounter);
  const barStart = startCol + Math.max(0, width - barWidth);
  let col = barStart;

  paintSegments(
    terminal,
    row,
    col,
    paintActivitySpinnerSegments(options.activityActive, options.activityTick),
  );
  col += ACTIVITY_SPINNER_WIDTH;

  if (!options.tokenCounter) {
    return;
  }

  col += STATUS_BAR_GAP;
  paintSegments(terminal, row, col, tokenCounterSegments(options.tokenCounter));
}

export function formatStatusBar(options: StatusBarOptions): string {
  const spinner = options.activityActive
    ? `[${activityFrame(options.activityTick)}]`
    : '[✓]';

  const counter = options.tokenCounter
    ? tokenCounterSegments(options.tokenCounter).map((segment) => segment.text).join('')
    : '';

  if (!counter) {
    return spinner;
  }

  return `${spinner}${' '.repeat(STATUS_BAR_GAP)}${counter}`;
}
