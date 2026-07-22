import { describe, it, expect } from 'vitest';

import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { paintHomePanel } from './homeFloorPlan';
import { applyContextDelta, applyHomeStateEvent, createHomeState } from './homeState';
import { getBottomLayout } from './smartHomeRenderer';

describe('getBottomLayout', () => {
  it('reserves only the input row when chrome is inactive', () => {
    expect(getBottomLayout(10, 0, false)).toEqual({
      contentRows: 9,
      inputRow: 9,
      paletteRow: null,
      queueBannerRow: null,
    });
  });

  it('stacks palette above input and queue above palette', () => {
    expect(getBottomLayout(10, 2, true)).toEqual({
      contentRows: 7,
      inputRow: 9,
      paletteRow: 8,
      queueBannerRow: 7,
    });
  });

  it('drops chrome that would land on a negative row', () => {
    expect(getBottomLayout(1, 2, true)).toEqual({
      contentRows: 0,
      inputRow: 0,
      paletteRow: null,
      queueBannerRow: null,
    });
  });

  it('prefers palette over queue when only one chrome row fits', () => {
    expect(getBottomLayout(2, 3, true)).toEqual({
      contentRows: 0,
      inputRow: 1,
      paletteRow: 0,
      queueBannerRow: null,
    });
  });

  it('keeps content from overlapping reserved chrome rows', () => {
    expect(getBottomLayout(3, 1, true)).toEqual({
      contentRows: 0,
      inputRow: 2,
      paletteRow: 1,
      queueBannerRow: 0,
    });
  });
});

function countCursorMoves(output: string): number {
  return (output.match(/\x1b\[\d+;\d+H/g) ?? []).length;
}

function makeRedraw(terminal: DiffTerminal, eventLog: EventLog, homeState: ReturnType<typeof createHomeState>) {
  const rows = Math.max(1, terminal.height - 1);

  return (): void => {
    const split = getSplitColumns(terminal.width);
    const leftLines = eventLog.render(rows, split.leftWidth);
    const rightWidth = Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH);

    terminal.clear();
    for (let row = 0; row < rows; row++) {
      terminal.fill(row, 0, (leftLines[row] ?? '').padEnd(split.leftWidth).slice(0, split.leftWidth));
    }
    drawVerticalDivider(terminal, split.dividerCol);
    paintHomePanel(terminal, split.dividerCol + 1, rightWidth, rows, homeState);
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

describe('applyHomeStateEvent in renderer flow', () => {
  it('fills home state from context_init before deltas apply', () => {
    const homeState = createHomeState();

    applyHomeStateEvent(homeState, {
      type: 'context_init',
      changes: [
        { controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'ON' },
        { controlGroup: 'light', room: 'livingRoom', deviceId: '2', value: 'ON' },
      ],
    });
    applyHomeStateEvent(homeState, {
      type: 'context_delta',
      changes: [{ controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' }],
    });

    expect(homeState).toEqual({
      light: {
        livingRoom: {
          '1': 'OFF',
          '2': 'ON',
        },
      },
    });
  });
});
