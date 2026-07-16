import type { HarnessEvent } from '../../../cli/jsonl';
import { HarnessSessionClient } from '../../../cli/harnessClient';
import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { paintInputLine, TerminalInputLine } from '../../../cli/tui/inputPrompt';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { paintHomePanel } from './homeFloorPlan';
import { applyContextDelta, createHomeState } from './homeState';
import { paintStatusBar } from './statusBar';
import type { TokenCounterState } from './tokenCounter';

const ACTIVITY_INTERVAL_MS = 120;

function contentHeight(terminalHeight: number): number {
  return Math.max(1, terminalHeight - 1);
}

function inputRow(terminalHeight: number): number {
  return terminalHeight - 1;
}

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
  private inputLine: TerminalInputLine;

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
    this.inputLine.setOnInterrupt(() => {
      this.interrupted = true;
      client.shutdown();
    });

    this.harnessActive = true;
    this.runStartedAt = Date.now();
    this.elapsedMs = 0;
    this.startActivityTimer();
    this.inputLine.block();
    this.redraw();

    await client.waitReady();
    this.harnessActive = false;
    this.inputLine.unblock();
    this.redraw();

    let nextCommand = this.initialCommand;

    while (!client.hasSessionEnded()) {
      if (this.interrupted) {
        client.shutdown();
        break;
      }

      if (nextCommand) {
        this.harnessActive = true;
        this.inputLine.block();
        this.redraw();
        client.sendCommand(nextCommand);
        await client.waitForTurn();
        this.inputLine.unblock();
        this.harnessActive = false;
        this.elapsedMs = this.currentElapsedMs();
        this.redraw();
        nextCommand = null;

        if (client.hasSessionEnded()) {
          break;
        }
      }

      const command = await this.inputLine.readLine();

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
    this.inputLine.close();
    this.redraw();

    return client.waitForExit();
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
    const rows = contentHeight(this.terminal.height);
    const leftLines = this.eventLog.render(rows, split.leftWidth);
    const rightWidth = Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH);
    const row = inputRow(this.terminal.height);

    this.terminal.clear();

    for (let lineRow = 0; lineRow < rows; lineRow++) {
      this.terminal.fill(lineRow, 0, (leftLines[lineRow] ?? '').padEnd(split.leftWidth).slice(0, split.leftWidth));
    }

    drawVerticalDivider(this.terminal, split.dividerCol);
    paintHomePanel(this.terminal, split.dividerCol + 1, rightWidth, rows, this.homeState);

    paintInputLine(this.terminal, row, split.leftWidth, {
      ...this.inputLine.getState(),
      blocked: this.harnessActive || this.inputLine.isBlocked(),
    });
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
