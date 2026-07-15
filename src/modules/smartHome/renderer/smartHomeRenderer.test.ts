import { describe, it, expect } from 'vitest';

import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { paintHomePanel } from './homeFloorPlan';
import { applyContextDelta, createHomeState } from './homeState';

function countCursorMoves(output: string): number {
  return (output.match(/\x1b\[\d+;\d+H/g) ?? []).length;
}

function makeRedraw(terminal: DiffTerminal, eventLog: EventLog, homeState: ReturnType<typeof createHomeState>) {
  return (): void => {
    const split = getSplitColumns(terminal.width);
    const leftLines = eventLog.render(terminal.height, split.leftWidth);
    const rightWidth = Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH);

    terminal.clear();
    for (let row = 0; row < terminal.height; row++) {
      terminal.fill(row, 0, (leftLines[row] ?? '').padEnd(split.leftWidth).slice(0, split.leftWidth));
    }
    drawVerticalDivider(terminal, split.dividerCol);
    paintHomePanel(terminal, split.dividerCol + 1, rightWidth, terminal.height, homeState);
    terminal.flush();
  };
}

describe('renderer frame composition', () => {
  it('writes nothing on identical redraw', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(24, 80, (chunk) => output.push(chunk));
    const eventLog = new EventLog();
    const homeState = createHomeState();
    const redraw = makeRedraw(terminal, eventLog, homeState);

    redraw();
    output.length = 0;
    redraw();

    expect(output.join('')).toBe('');
    expect(countCursorMoves(output.join(''))).toBe(0);
  });

  it('writes only a small diff after a single device change', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(24, 80, (chunk) => output.push(chunk));
    const eventLog = new EventLog();
    const homeState = createHomeState();
    const redraw = makeRedraw(terminal, eventLog, homeState);

    redraw();
    output.length = 0;

    eventLog.append({ type: 'user_command', command: 'turn off light 1' });
    applyContextDelta(homeState, [
      { controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' },
    ]);
    eventLog.append({
      type: 'context_delta',
      changes: [{ controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' }],
    });
    redraw();

    const diff = output.join('');
    const fullCells = terminal.height * terminal.width;

    expect(diff).not.toContain('\x1b[2J');
    expect(countCursorMoves(diff)).toBeLessThan(fullCells / 10);
    expect(countCursorMoves(diff)).toBeGreaterThan(0);
  });
});
