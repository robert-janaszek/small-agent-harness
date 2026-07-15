import type { HarnessEvent } from '../../../cli/jsonl';
import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { paintHomePanel } from './homeFloorPlan';
import { applyContextDelta, createHomeState } from './homeState';
import { readHarnessEvents, spawnHarness } from './spawnHarness';
import { paintTokenCounter, type TokenCounterState } from './tokenCounter';

function isHarnessEvent(raw: unknown): raw is HarnessEvent {
  return typeof raw === 'object' && raw !== null && 'type' in raw;
}

export class SmartHomeRenderer {
  private terminal: DiffTerminal;
  private command: string;
  private eventLog = new EventLog();
  private homeState = createHomeState();
  private tokenCounter: TokenCounterState | null = null;

  constructor(terminal: DiffTerminal, command: string) {
    this.terminal = terminal;
    this.command = command;
  }

  async run(): Promise<number> {
    this.redraw();

    const child = spawnHarness(this.command);
    let exitCode = 1;

    child.on('close', (code) => {
      exitCode = code ?? 1;
    });

    const readDone = readHarnessEvents(child.stdout!, (raw) => this.onEvent(raw));
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

    this.redraw();
    return exitCode;
  }

  private redraw(): void {
    const split = getSplitColumns(this.terminal.width);
    const leftLines = this.eventLog.render(this.terminal.height, split.leftWidth);
    const rightWidth = Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH);

    this.terminal.clear();

    for (let row = 0; row < this.terminal.height; row++) {
      this.terminal.fill(row, 0, (leftLines[row] ?? '').padEnd(split.leftWidth).slice(0, split.leftWidth));
    }

    drawVerticalDivider(this.terminal, split.dividerCol);
    paintHomePanel(this.terminal, split.dividerCol + 1, rightWidth, this.terminal.height, this.homeState);
    paintTokenCounter(
      this.terminal,
      split.dividerCol + 1,
      rightWidth,
      this.terminal.height - 1,
      this.tokenCounter,
    );
    this.terminal.flush();
  }

  private onEvent(raw: unknown): void {
    if (!isHarnessEvent(raw)) {
      return;
    }

    if (raw.type === 'tokens') {
      this.tokenCounter = { usage: raw.usage, iteration: raw.iteration };
    } else if (raw.type === 'agent_response') {
      this.tokenCounter = { usage: raw.tokenUsage, iteration: raw.iterations };
      this.eventLog.append(raw);
    } else if (raw.type !== 'context_delta' || raw.changes.length > 0) {
      this.eventLog.append(raw);
    }

    if (raw.type === 'context_delta') {
      applyContextDelta(this.homeState, raw.changes);
    }

    this.redraw();
  }
}
