import { describe, it, expect } from 'vitest';

import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { paintHomePanel } from './homeFloorPlan';
import { applyContextDelta, createHomeState } from './homeState';

describe('renderer frame composition', () => {
  it('emits diff output when events and home state change', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(14, 80, (chunk) => output.push(chunk));
    const eventLog = new EventLog();
    const homeState = createHomeState();

    const redraw = (): void => {
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
    expect(diff.length).toBeGreaterThan(0);
    expect(diff).not.toContain('\x1b[2J');
  });
});
