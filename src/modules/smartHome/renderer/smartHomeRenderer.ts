import type { HarnessEvent } from '../../../cli/jsonl';
import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { paintHomePanel } from './homeFloorPlan';
import { applyContextDelta, createHomeState } from './homeState';
import { readHarnessEvents, spawnHarness } from './spawnHarness';

export class SmartHomeRenderer {
  private terminal: DiffTerminal;
  private command: string;
  private eventLog = new EventLog();
  private homeState = createHomeState();

  constructor(terminal: DiffTerminal, command: string) {
    this.terminal = terminal;
    this.command = command;
  }

  async run(): Promise<number> {
    const redraw = (): void => {
      const split = getSplitColumns(this.terminal.width);
      const leftLines = this.eventLog.render(this.terminal.height, split.leftWidth);
      const rightWidth = Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH);

      this.terminal.clear();

      for (let row = 0; row < this.terminal.height; row++) {
        this.terminal.fill(row, 0, (leftLines[row] ?? '').padEnd(split.leftWidth).slice(0, split.leftWidth));
      }

      drawVerticalDivider(this.terminal, split.dividerCol);
      paintHomePanel(this.terminal, split.dividerCol + 1, rightWidth, this.terminal.height, this.homeState);
      this.terminal.flush();
    };

    const onEvent = (raw: unknown): void => {
      const event = raw as HarnessEvent;
      if (!event || typeof event !== 'object' || !('type' in event)) {
        return;
      }

      this.eventLog.append(event);
      if (event.type === 'context_delta') {
        applyContextDelta(this.homeState, event.changes);
      }

      redraw();
    };

    redraw();

    const child = spawnHarness(this.command);
    let exitCode = 1;

    child.on('close', (code) => {
      exitCode = code ?? 1;
    });

    const readDone = readHarnessEvents(child.stdout!, onEvent);
    child.stderr?.on('data', () => {
      // harness batch mode should stay quiet on stderr
    });

    await readDone;
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once('close', () => resolve());
    });

    redraw();
    return exitCode;
  }
}
