import type { HarnessEvent } from '../../../cli/jsonl';
import { HarnessSessionClient } from '../../../cli/harnessClient';
import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { paintInputLine, paintQueueBanner, TerminalInputLine } from '../../../cli/tui/inputPrompt';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { paintHomePanel } from './homeFloorPlan';
import { applyContextDelta, createHomeState } from './homeState';
import { paintStatusBar } from './statusBar';
import type { TokenCounterState } from './tokenCounter';

const ACTIVITY_INTERVAL_MS = 120;

function contentHeight(terminalHeight: number, queueLength: number): number {
  const reservedRows = queueLength > 0 ? 2 : 1;
  return Math.max(1, terminalHeight - reservedRows);
}

function inputRow(terminalHeight: number): number {
  return terminalHeight - 1;
}

function queueBannerRow(terminalHeight: number, queueLength: number): number | null {
  return queueLength > 0 ? terminalHeight - 2 : null;
}

export class SmartHomeRenderer {
  private terminal: DiffTerminal;
  private initialCommand: string | null;
  private eventLog = new EventLog();
  private homeState = createHomeState();
  private tokenCounter: TokenCounterState | null = null;
  private activityTick = 0;
  private harnessActive = false;
  private harnessReady = false;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private runStartedAt: number | null = null;
  private elapsedMs = 0;
  private inputLine: TerminalInputLine;
  private commandQueue: string[] = [];
  private dispatching = false;

  constructor(terminal: DiffTerminal, initialCommand: string | null = null) {
    this.terminal = terminal;
    this.initialCommand = initialCommand;
    this.inputLine = new TerminalInputLine(() => {
      this.redraw();
    });
  }

  private interrupted = false;

  async run(): Promise<number> {
    const client = new HarnessSessionClient();
    client.onEvent((event) => this.onEvent(event));

    this.runStartedAt = Date.now();
    this.elapsedMs = 0;
    this.startActivityTimer();

    this.inputLine.setOnInterrupt(() => {
      if (this.harnessActive) {
        client.cancelTurn();
        return;
      }

      this.interrupted = true;
      client.shutdown();
    });

    this.inputLine.start((command) => {
      if (this.interrupted || client.hasSessionEnded()) {
        return;
      }

      if (command === '/exit') {
        this.interrupted = true;
        client.shutdown();
        return;
      }

      if (command.length === 0) {
        return;
      }

      this.commandQueue.push(command);
      this.redraw();
      void this.drainQueue(client);
    });

    this.harnessActive = true;
    this.redraw();

    await client.waitReady();
    this.harnessReady = true;
    this.harnessActive = false;

    if (this.initialCommand) {
      this.commandQueue.push(this.initialCommand);
      this.redraw();
    }

    void this.drainQueue(client);
    await this.waitForSessionEnd(client);

    this.harnessActive = false;
    this.elapsedMs = this.currentElapsedMs();
    this.runStartedAt = null;
    this.stopActivityTimer();
    this.inputLine.close();
    this.redraw();

    return client.waitForExit();
  }

  private async waitForSessionEnd(client: HarnessSessionClient): Promise<void> {
    if (client.hasSessionEnded() || this.interrupted) {
      return;
    }

    await new Promise<void>((resolve) => {
      const unsubscribe = client.onEvent((event) => {
        if (event.type === 'session_end' || this.interrupted) {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  private async drainQueue(client: HarnessSessionClient): Promise<void> {
    if (this.dispatching || !this.harnessReady) {
      return;
    }

    this.dispatching = true;

    while (this.commandQueue.length > 0 && !this.interrupted && !client.hasSessionEnded()) {
      const command = this.commandQueue.shift()!;
      this.redraw();
      await this.runTurn(client, command);
    }

    this.dispatching = false;

    if (this.commandQueue.length > 0) {
      void this.drainQueue(client);
    }
  }

  private async runTurn(client: HarnessSessionClient, command: string): Promise<void> {
    this.harnessActive = true;
    if (this.runStartedAt === null) {
      this.runStartedAt = Date.now();
    }

    client.sendCommand(command);
    await client.waitForTurn();
    this.harnessActive = false;
    this.elapsedMs = this.currentElapsedMs();
    this.redraw();
  }

  private currentElapsedMs(): number {
    if (this.runStartedAt !== null) {
      return Date.now() - this.runStartedAt;
    }

    return this.elapsedMs;
  }

  refresh(): void {
    this.redraw();
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

  private paintStatusBarOnTerminal(): void {
    const split = getSplitColumns(this.terminal.width);
    const rightWidth = Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH);

    paintStatusBar(this.terminal, split.dividerCol + 1, rightWidth, inputRow(this.terminal.height), {
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
    const queueLength = this.commandQueue.length;
    const rows = contentHeight(this.terminal.height, queueLength);
    const leftLines = this.eventLog.render(rows, split.leftWidth);
    const rightWidth = Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH);
    const row = inputRow(this.terminal.height);
    const bannerRow = queueBannerRow(this.terminal.height, queueLength);

    this.terminal.clear();

    for (let lineRow = 0; lineRow < rows; lineRow++) {
      this.terminal.fill(lineRow, 0, (leftLines[lineRow] ?? '').padEnd(split.leftWidth).slice(0, split.leftWidth));
    }

    drawVerticalDivider(this.terminal, split.dividerCol);
    paintHomePanel(this.terminal, split.dividerCol + 1, rightWidth, rows, this.homeState);

    if (bannerRow !== null) {
      paintQueueBanner(this.terminal, bannerRow, split.leftWidth, queueLength);
    }

    paintInputLine(this.terminal, row, split.leftWidth, this.inputLine.getState());
    this.paintStatusBarOnTerminal();
    this.terminal.flush();
  }

  private onEvent(raw: HarnessEvent): void {
    if (raw.type === 'tokens') {
      this.tokenCounter = { usage: raw.usage, iteration: raw.iteration };
    } else if (raw.type === 'agent_response') {
      this.tokenCounter = { usage: raw.tokenUsage, iteration: raw.iterations };
      if (raw.content.trim().length > 0) {
        this.eventLog.append(raw);
      }
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
