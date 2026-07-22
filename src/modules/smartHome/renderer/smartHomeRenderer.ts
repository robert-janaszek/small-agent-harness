import type { HarnessEvent } from '../../../cli/jsonl';
import { HarnessSessionClient } from '../../../cli/harnessClient';
import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import {
  paintCommandPalette,
  paintInputLine,
  paintQueueBanner,
  TerminalInputLine,
} from '../../../cli/tui/inputPrompt';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { FLOOR_PLAN_MIN_WIDTH } from './homeFloorPlan.template';
import { paintHomePanel } from './homeFloorPlan';
import { applyHomeStateEvent, createHomeState } from './homeState';
import { paintStatusBar } from './statusBar';
import type { TokenCounterState } from './tokenCounter';

const ACTIVITY_INTERVAL_MS = 120;

export type BottomLayout = {
  contentRows: number;
  inputRow: number;
  paletteRow: number | null;
  queueBannerRow: number | null;
};

export function getBottomLayout(
  terminalHeight: number,
  queueLength: number,
  paletteActive: boolean,
): BottomLayout {
  const height = Math.max(1, terminalHeight);
  let row = height - 1;
  const inputRow = row;
  row -= 1;

  let paletteRow: number | null = null;
  if (paletteActive && row >= 0) {
    paletteRow = row;
    row -= 1;
  }

  let queueBannerRow: number | null = null;
  if (queueLength > 0 && row >= 0) {
    queueBannerRow = row;
    row -= 1;
  }

  return {
    contentRows: Math.max(0, row + 1),
    inputRow,
    paletteRow,
    queueBannerRow,
  };
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
  private turnStartedAt: number | null = null;
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

  private clearCommandQueue(): void {
    if (this.commandQueue.length === 0) {
      return;
    }

    this.commandQueue = [];
    this.redraw();
  }

  private requestExit(client: HarnessSessionClient): void {
    if (this.interrupted || client.hasSessionEnded()) {
      return;
    }

    this.interrupted = true;
    this.clearCommandQueue();
    client.shutdown();
  }

  async run(): Promise<number> {
    const client = new HarnessSessionClient();
    client.onEvent((event) => this.onEvent(event));

    this.elapsedMs = 0;
    this.startActivityTimer();

    this.inputLine.setOnInterrupt(() => {
      if (this.harnessReady && this.harnessActive) {
        // Cancel the in-flight turn and drop pending work so Ctrl+C cannot get
        // stuck repeatedly cancelling a non-empty queue.
        this.clearCommandQueue();
        client.cancelTurn();
        return;
      }

      this.requestExit(client);
    });

    this.inputLine.start((command) => {
      if (this.interrupted || client.hasSessionEnded()) {
        return;
      }

      if (command === '/exit') {
        this.requestExit(client);
        return;
      }

      if (command === '/clear') {
        this.eventLog.clear();
        this.redraw();
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
    await client.waitForContextInit();
    this.harnessReady = true;
    this.harnessActive = false;

    if (this.initialCommand) {
      this.commandQueue.push(this.initialCommand);
      this.redraw();
    }

    void this.drainQueue(client);
    await this.waitForSessionEnd(client);

    this.harnessActive = false;
    this.turnStartedAt = null;
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
      const unsubscribe = client.onSessionEnded(() => {
        unsubscribe();
        resolve();
      });
    });
  }

  private async drainQueue(client: HarnessSessionClient): Promise<void> {
    if (this.dispatching || !this.harnessReady || this.interrupted || client.hasSessionEnded()) {
      return;
    }

    this.dispatching = true;

    while (this.commandQueue.length > 0 && !this.interrupted && !client.hasSessionEnded()) {
      const command = this.commandQueue.shift()!;
      this.redraw();

      if (command === '/exit') {
        this.requestExit(client);
        break;
      }

      await this.runTurn(client, command);
    }

    this.dispatching = false;

    if (this.commandQueue.length > 0 && !this.interrupted && !client.hasSessionEnded()) {
      void this.drainQueue(client);
    }
  }

  private async runTurn(client: HarnessSessionClient, command: string): Promise<void> {
    this.harnessActive = true;
    this.turnStartedAt = Date.now();

    client.sendCommand(command);
    await client.waitForTurn();
    this.harnessActive = false;
    this.elapsedMs = Date.now() - this.turnStartedAt;
    this.turnStartedAt = null;
    this.redraw();
  }

  private currentElapsedMs(): number {
    if (this.turnStartedAt !== null) {
      return Date.now() - this.turnStartedAt;
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

    paintStatusBar(this.terminal, split.dividerCol + 1, rightWidth, this.terminal.height - 1, {
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
    const inputState = this.inputLine.getState();
    const layout = getBottomLayout(
      this.terminal.height,
      queueLength,
      inputState.commandPalette !== null,
    );
    const leftLines = this.eventLog.render(layout.contentRows, split.leftWidth);
    const rightWidth = Math.max(split.rightWidth, FLOOR_PLAN_MIN_WIDTH);

    this.terminal.clear();

    for (let lineRow = 0; lineRow < layout.contentRows; lineRow++) {
      this.terminal.fill(lineRow, 0, (leftLines[lineRow] ?? '').padEnd(split.leftWidth).slice(0, split.leftWidth));
    }

    drawVerticalDivider(this.terminal, split.dividerCol);
    paintHomePanel(this.terminal, split.dividerCol + 1, rightWidth, layout.contentRows, this.homeState);

    if (layout.queueBannerRow !== null) {
      paintQueueBanner(this.terminal, layout.queueBannerRow, split.leftWidth, queueLength);
    }

    if (layout.paletteRow !== null && inputState.commandPalette !== null) {
      paintCommandPalette(this.terminal, layout.paletteRow, split.leftWidth, inputState.commandPalette);
    }

    paintInputLine(this.terminal, layout.inputRow, split.leftWidth, inputState);
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

    applyHomeStateEvent(this.homeState, raw);

    this.redraw();
  }
}
