import type { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { colors } from '../../../cli/tui/colors';

export const ACTIVITY_SPINNER_WIDTH = 3;
export const STATUS_BAR_GAP = 1;

export const ACTIVITY_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

export function activityFrame(tick: number): string {
  const index = ((tick % ACTIVITY_FRAMES.length) + ACTIVITY_FRAMES.length) % ACTIVITY_FRAMES.length;
  return ACTIVITY_FRAMES[index]!;
}

export function paintActivitySpinner(
  terminal: DiffTerminal,
  col: number,
  row: number,
  tick: number,
  active: boolean,
): void {
  if (active) {
    terminal.setChar(row, col, '[', colors.text);
    terminal.setChar(row, col + 1, activityFrame(tick), colors.cursor);
    terminal.setChar(row, col + 2, ']', colors.text);
    return;
  }

  terminal.setChar(row, col, '[', colors.success);
  terminal.setChar(row, col + 1, '✓', colors.success);
  terminal.setChar(row, col + 2, ']', colors.success);
}

export function paintActivitySpinnerSegments(
  active: boolean,
  tick: number,
): Array<{ text: string; fg?: number }> {
  if (active) {
    return [
      { text: '[', fg: colors.text },
      { text: activityFrame(tick), fg: colors.cursor },
      { text: ']', fg: colors.text },
    ];
  }

  return [
    { text: '[', fg: colors.success },
    { text: '✓', fg: colors.success },
    { text: ']', fg: colors.success },
  ];
}

export function paintSegments(
  terminal: DiffTerminal,
  row: number,
  startCol: number,
  segments: Array<{ text: string; fg?: number }>,
): void {
  let col = startCol;
  for (const segment of segments) {
    for (const ch of segment.text) {
      terminal.setChar(row, col, ch, segment.fg);
      col += 1;
    }
  }
}
