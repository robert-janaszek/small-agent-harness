import { describe, it, expect } from 'vitest';

import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { composeSplitFrame, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { renderHomePanel } from './homeFloorPlan';
import { applyContextDelta, createHomeState } from './homeState';

describe('renderer frame composition', () => {
  it('emits diff output when events and home state change', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(12, 70, (chunk) => output.push(chunk));
    const eventLog = new EventLog();
    const homeState = createHomeState();

    const redraw = (): void => {
      const split = getSplitColumns(terminal.width);
      composeSplitFrame(
        terminal,
        eventLog.render(terminal.height, split.leftWidth),
        renderHomePanel(Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH), terminal.height, homeState),
      );
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
