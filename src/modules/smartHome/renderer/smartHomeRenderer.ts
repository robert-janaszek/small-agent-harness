import type { HarnessEvent } from '../../../cli/jsonl';
import { HarnessSessionClient } from '../../../cli/harnessClient';
import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { createInputPrompt } from '../../../cli/tui/inputPrompt';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { paintHomePanel } from './homeFloorPlan';
import { applyContextDelta, createHomeState } from './homeState';
import { paintStatusBar } from './statusBar';
import type { TokenCounterState } from './tokenCounter';

const ACTIVITY_INTERVAL_MS = 120;

export class SmartHomeRenderer {
  private terminal: DiffTerminal;
  private initialCommand: string | null;
  private eventLog = new EventLog();
  private homeState = createHomeState();
  private tokenCounter: TokenCounterState | null = null;
  private activityTick = 0;
  private harnessActive = false;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private runStartedAt: number | null = null;
  private elapsedMs = 0;
  private inputPrompt = createInputPrompt();

  constructor(terminal: DiffTerminal, initialCommand: string | null = null) {
    this.terminal = terminal;
    this.initialCommand = initialCommand;
  }

  async run(): Promise<number> {
    const client = new HarnessSessionClient();
    client.onEvent((event) => this.onEvent(event));

    this.harnessActive = true;
    this.runStartedAt = Date.now();
    this.elapsedMs = 0;
    this.startActivityTimer();
    this.redraw();

    await client.waitReady();
    this.harnessActive = false;
    this.redraw();

    let nextCommand = this.initialCommand;

    while (!client.hasSessionEnded()) {
      if (nextCommand) {
        this.harnessActive = true;
        this.redraw();
        client.sendCommand(nextCommand);
        await client.waitForTurn();
        this.harnessActive = false;
        this.elapsedMs = this.currentElapsedMs();
        this.redraw();
        nextCommand = null;

        if (client.hasSessionEnded()) {
          break;
        }
      }

      this.terminal.leave();
      const command = await this.inputPrompt.read();
      this.terminal.enter();
      this.redraw();

      if (command === null || command === '/exit') {
        client.shutdown();
        break;
      }

      if (command.length === 0) {
        continue;
      }

      nextCommand = command;
    }

    this.harnessActive = false;
    this.elapsedMs = this.currentElapsedMs();
    this.runStartedAt = null;
    this.stopActivityTimer();
    this.inputPrompt.close();
    this.redraw();

    return client.waitForExit();
  }

  private currentElapsedMs(): number {
    if (this.runStartedAt !== null) {
      return Date.now() - this.runStartedAt;
    }

    return this.elapsedMs;
  }

  private startActivityTimer(): void {
    this.activityTimer = setInterval(() => {
      this.activityTick += 1;
      this.pulseStatusBar();
    }, ACTIVITY_INTERVAL_MS);
  }

  private stopActivityTimer(): void {
    if (this.activityTimer !== null) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private statusRow(): number {
    return this.terminal.height - 1;
  }

  private paintStatusBarOnTerminal(): void {
    const split = getSplitColumns(this.terminal.width);
    const rightWidth = Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH);

    paintStatusBar(this.terminal, split.dividerCol + 1, rightWidth, this.statusRow(), {
      tokenCounter: this.tokenCounter,
      activityTick: this.activityTick,
      activityActive: this.harnessActive,
      elapsedMs: this.currentElapsedMs(),
    });
  }

  private pulseStatusBar(): void {
    if (!this.harnessActive) {
      return;
    }

    this.paintStatusBarOnTerminal();
    this.terminal.flush();
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
    this.paintStatusBarOnTerminal();
    this.terminal.flush();
  }

  private onEvent(raw: HarnessEvent): void {
    if (raw.type === 'tokens') {
      this.tokenCounter = { usage: raw.usage, iteration: raw.iteration };
    } else if (raw.type === 'agent_response') {
      this.tokenCounter = { usage: raw.tokenUsage, iteration: raw.iterations };
      this.eventLog.append(raw);
    } else if (raw.type !== 'context_delta' || raw.changes.length > 0) {
      if (raw.type !== 'ready' && raw.type !== 'session_end') {
        this.eventLog.append(raw);
      }
    }

    if (raw.type === 'context_delta') {
      applyContextDelta(this.homeState, raw.changes);
    }

    this.redraw();
  }
}
