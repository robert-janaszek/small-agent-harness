import type { DiffTerminal } from '../../../cli/tui/diffTerminal';
import {
  ACTIVITY_SPINNER_WIDTH,
  activityFrame,
  paintActivitySpinnerSegments,
  paintSegments,
  STATUS_BAR_GAP,
} from './activitySpinner';
import { formatStopwatch, stopwatchSegments, STOPWATCH_WIDTH } from './stopwatch';
import { tokenCounterSegments, TOKEN_COUNT_FIELD_WIDTH, TOKEN_ITERATION_FIELD_WIDTH } from './tokenCounter';
import type { TokenCounterState } from './tokenCounter';

export const TOKEN_COUNTER_WIDTH =
  1 + TOKEN_COUNT_FIELD_WIDTH + 1 + 1 + TOKEN_COUNT_FIELD_WIDTH + 1 + 1 + TOKEN_COUNT_FIELD_WIDTH + 1 + 1 + TOKEN_ITERATION_FIELD_WIDTH;

export type StatusBarOptions = {
  tokenCounter: TokenCounterState | null;
  activityTick: number;
  activityActive: boolean;
  elapsedMs: number;
};

export function statusBarWidth(tokenCounter: TokenCounterState | null): number {
  let width = ACTIVITY_SPINNER_WIDTH + STATUS_BAR_GAP + STOPWATCH_WIDTH;

  if (tokenCounter) {
    width += STATUS_BAR_GAP + TOKEN_COUNTER_WIDTH;
  }

  return width;
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

  col += STATUS_BAR_GAP;
  paintSegments(terminal, row, col, stopwatchSegments(options.elapsedMs));
  col += STOPWATCH_WIDTH;

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

  const stopwatch = formatStopwatch(options.elapsedMs);
  const counter = options.tokenCounter
    ? tokenCounterSegments(options.tokenCounter).map((segment) => segment.text).join('')
    : '';

  let line = `${spinner}${' '.repeat(STATUS_BAR_GAP)}${stopwatch}`;

  if (counter) {
    line += `${' '.repeat(STATUS_BAR_GAP)}${counter}`;
  }

  return line;
}
