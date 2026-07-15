import type { AnsiColor, DiffTerminal } from '../../../cli/tui/diffTerminal';

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
    terminal.setChar(row, col, '[', 37);
    terminal.setChar(row, col + 1, activityFrame(tick), 36);
    terminal.setChar(row, col + 2, ']', 37);
    return;
  }

  terminal.setChar(row, col, '[', 32);
  terminal.setChar(row, col + 1, '✓', 32);
  terminal.setChar(row, col + 2, ']', 32);
}

export function paintActivitySpinnerSegments(
  active: boolean,
  tick: number,
): Array<{ text: string; fg?: AnsiColor }> {
  if (active) {
    return [
      { text: '[', fg: 37 },
      { text: activityFrame(tick), fg: 36 },
      { text: ']', fg: 37 },
    ];
  }

  return [
    { text: '[', fg: 32 },
    { text: '✓', fg: 32 },
    { text: ']', fg: 32 },
  ];
}

export function paintSegments(
  terminal: DiffTerminal,
  row: number,
  startCol: number,
  segments: Array<{ text: string; fg?: AnsiColor }>,
): void {
  let col = startCol;
  for (const segment of segments) {
    for (const ch of segment.text) {
      terminal.setChar(row, col, ch, segment.fg);
      col += 1;
    }
  }
}
