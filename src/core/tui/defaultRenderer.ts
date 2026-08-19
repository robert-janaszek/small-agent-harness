import { colors } from './colors';
import { DiffTerminal } from './diffTerminal';
import {
  paintCommandPalette,
  paintInputLine,
  paintQueueBanner,
  TerminalInputLine,
} from './inputPrompt';
import { drawVerticalDivider, getSplitColumns } from './splitLayout';
import type { EventBus } from '../eventBus';
import type { Harness } from '../harness';
import type { ModulePanel } from '../module';
import type { CoreEvent } from '../protocol';
import { EventLog } from './eventLog';
import { getBottomLayout } from './layout';
import { paintStatusBar } from './statusBar';
import type { TokenCounterState } from './tokenCounter';
import { indexToolActivity } from './toolActivity';

const NO_MODULE_LABEL = 'no module';
const ACTIVITY_INTERVAL_MS = 120;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function paintNoModulePanel(
  terminal: DiffTerminal,
  startCol: number,
  width: number,
  contentRows: number,
): void {
  if (contentRows <= 0 || width <= 0) {
    return;
  }

  const label = NO_MODULE_LABEL.slice(0, width);
  const col = startCol + Math.max(0, Math.floor((width - label.length) / 2));
  const row = Math.floor(contentRows / 2);

  for (let index = 0; index < label.length; index++) {
    terminal.setChar(row, col + index, label[index] ?? ' ', colors.text);
  }
}

export type DefaultRendererOptions = {
  initialCommand?: string | null;
  panel?: ModulePanel | null;
  panelModuleId?: string | null;
};

export class DefaultRenderer {
  private terminal: DiffTerminal;
  private harness: Harness;
  private bus: EventBus;
  private initialCommand: string | null;
  private panel: ModulePanel | null;
  private panelModuleId: string | null;
  private eventLog: EventLog;
  private inputLine: TerminalInputLine;
  private commandQueue: string[] = [];
  private dispatching = false;
  private turnActive = false;
  private currentAbort: AbortController | null = null;
  private currentTurn: Promise<void> | null = null;
  private interrupted = false;
  private unsubscribe: (() => void) | null = null;
  private sessionEnded = false;
  private resolveSession: (() => void) | null = null;
  private tokenCounter: TokenCounterState | null = null;
  private activityTick = 0;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private turnStartedAt: number | null = null;
  private elapsedMs = 0;
  private exitCode = 0;
  private streamDirty = false;

  constructor(
    terminal: DiffTerminal,
    harness: Harness,
    bus: EventBus,
    options: DefaultRendererOptions = {},
  ) {
    this.terminal = terminal;
    this.harness = harness;
    this.bus = bus;
    this.initialCommand = options.initialCommand ?? null;
    this.panel = options.panel ?? null;
    this.panelModuleId = options.panelModuleId ?? null;
    this.eventLog = new EventLog(indexToolActivity(harness.getTools()));
    this.inputLine = new TerminalInputLine(() => {
      this.redraw();
    });
    this.unsubscribe = this.bus.subscribe((event) => this.onEvent(event));
  }

  refresh(): void {
    this.redraw();
  }

  shutdown(exitCode = 0): void {
    this.exitCode = exitCode;
    void this.requestExit();
  }

  async run(): Promise<number> {
    this.harness.startSession();
    this.startActivityTimer();

    this.inputLine.setOnInterrupt(() => {
      void this.handleInterrupt();
    });

    this.inputLine.start((command) => {
      void this.handleInput(command);
    });

    this.redraw();

    if (this.initialCommand) {
      void this.submitCommand(this.initialCommand);
    }

    await this.waitForSessionEnd();

    this.stopActivityTimer();
    this.inputLine.close();
    this.unsubscribe?.();
    this.unsubscribe = null;
    return this.exitCode;
  }

  async handleInput(command: string): Promise<void> {
    if (this.interrupted || this.sessionEnded) {
      return;
    }

    if (command === '/exit') {
      await this.requestExit();
      return;
    }

    if (command === '/clear') {
      this.eventLog.clear();
      this.redraw();
      return;
    }

    if (command === '/reset') {
      await this.resetSession();
      return;
    }

    if (command.length === 0) {
      return;
    }

    await this.submitCommand(command);
  }

  private async submitCommand(command: string): Promise<void> {
    if (this.dispatching || this.turnActive) {
      this.commandQueue.push(command);
      this.redraw();
      return;
    }

    await this.drainQueue(command);
  }

  private async handleInterrupt(): Promise<void> {
    if (this.turnActive) {
      this.commandQueue = [];
      this.eventLog.cancelStreaming();
      this.currentAbort?.abort();
      this.redraw();
      return;
    }

    this.exitCode = 130;
    await this.requestExit();
  }

  private async resetSession(): Promise<void> {
    this.commandQueue = [];
    if (this.currentAbort) {
      this.currentAbort.abort();
      await this.currentTurn?.catch(() => undefined);
    }
    this.eventLog.clear();
    this.tokenCounter = null;
    this.elapsedMs = 0;
    this.harness.resetSession();
    this.redraw();
  }

  private async requestExit(): Promise<void> {
    if (this.sessionEnded) {
      this.settleSession();
      return;
    }

    this.interrupted = true;
    this.sessionEnded = true;
    this.commandQueue = [];
    this.currentAbort?.abort();
    await this.currentTurn?.catch(() => undefined);
    this.harness.endSession();
    this.settleSession();
  }

  private settleSession(): void {
    this.sessionEnded = true;
    this.resolveSession?.();
    this.resolveSession = null;
  }

  private waitForSessionEnd(): Promise<void> {
    if (this.sessionEnded) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.resolveSession = resolve;
    });
  }

  private async drainQueue(first?: string): Promise<void> {
    if (this.dispatching || this.interrupted || this.sessionEnded) {
      return;
    }

    this.dispatching = true;

    if (first) {
      await this.runTurn(first);
    }

    while (this.commandQueue.length > 0 && !this.interrupted && !this.sessionEnded) {
      const command = this.commandQueue.shift()!;
      this.redraw();
      await this.runTurn(command);
    }

    this.dispatching = false;

    if (this.commandQueue.length > 0 && !this.interrupted && !this.sessionEnded) {
      await this.drainQueue();
    }
  }

  private async runTurn(command: string): Promise<void> {
    this.turnActive = true;
    this.turnStartedAt = Date.now();
    this.currentAbort = new AbortController();
    const turn = this.executeTurn(command, this.currentAbort.signal);
    this.currentTurn = turn;
    await turn;
    this.elapsedMs = Date.now() - this.turnStartedAt;
    this.turnStartedAt = null;
    this.currentTurn = null;
    this.currentAbort = null;
    this.turnActive = false;
    if (!this.interrupted) {
      this.redraw();
    }
  }

  private async executeTurn(command: string, signal: AbortSignal): Promise<void> {
    try {
      await this.harness.run(command, {
        signal,
        onTextDelta: (delta) => {
          this.eventLog.appendDelta(delta);
          this.streamDirty = true;
        },
        onTextDeltaCancel: () => {
          this.eventLog.cancelStreaming();
          this.streamDirty = true;
        },
      });
    } catch (error: unknown) {
      if (isAbortError(error)) {
        this.eventLog.cancelStreaming();
        if (!this.interrupted && !this.sessionEnded) {
          this.harness.emitError('Cancelled.');
        }
        return;
      }

      if (this.sessionEnded) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      this.harness.emitError(message);
    }
  }

  private onEvent(event: CoreEvent): void {
    if (event.type === 'session_end') {
      this.settleSession();
    }

    if (event.type === 'tokens') {
      this.tokenCounter = { usage: event.usage, iteration: event.iteration };
    } else if (event.type === 'agent_response') {
      this.tokenCounter = { usage: event.tokenUsage, iteration: event.iterations };
    } else if (event.type === 'module') {
      if (!this.panelModuleId || event.module === this.panelModuleId) {
        this.panel?.onEvent?.(event.event, event.payload);
      }
    }

    this.eventLog.append(event);
    this.redraw();
  }

  private currentElapsedMs(): number {
    if (this.turnStartedAt !== null) {
      return Date.now() - this.turnStartedAt;
    }

    return this.elapsedMs;
  }

  private startActivityTimer(): void {
    if (this.activityTimer !== null) {
      return;
    }

    this.activityTimer = setInterval(() => {
      this.activityTick += 1;
      this.pulseStatusBar();
    }, ACTIVITY_INTERVAL_MS);
  }

  private stopActivityTimer(): void {
    if (this.activityTimer === null) {
      return;
    }

    clearInterval(this.activityTimer);
    this.activityTimer = null;
  }

  private paintStatusBarOnTerminal(): void {
    const split = getSplitColumns(this.terminal.width);
    paintStatusBar(this.terminal, split.dividerCol + 1, split.rightWidth, this.terminal.height - 1, {
      tokenCounter: this.tokenCounter,
      activityTick: this.activityTick,
      activityActive: this.turnActive,
      elapsedMs: this.currentElapsedMs(),
    });
  }

  private pulseStatusBar(): void {
    if (!this.turnActive || this.interrupted) {
      return;
    }

    if (this.streamDirty) {
      this.redraw();
      return;
    }

    this.paintStatusBarOnTerminal();
    this.terminal.flush();
  }

  private redraw(): void {
    if (this.interrupted) {
      return;
    }
    this.streamDirty = false;
    const split = getSplitColumns(this.terminal.width);
    const queueLength = this.commandQueue.length;
    const inputState = this.inputLine.getState();
    const palette = inputState.commandPalette;
    const layout = getBottomLayout(
      this.terminal.height,
      queueLength,
      palette?.matches.length ?? 0,
    );
    const leftLines = this.eventLog.render(layout.contentRows, split.leftWidth);

    this.terminal.clear();

    for (let lineRow = 0; lineRow < layout.contentRows; lineRow++) {
      this.terminal.fill(
        lineRow,
        0,
        (leftLines[lineRow] ?? '').padEnd(split.leftWidth).slice(0, split.leftWidth),
      );
    }

    drawVerticalDivider(this.terminal, split.dividerCol);
    if (this.panel) {
      this.panel.paint({
        terminal: this.terminal,
        startCol: split.dividerCol + 1,
        width: split.rightWidth,
        height: layout.contentRows,
      });
    } else {
      paintNoModulePanel(this.terminal, split.dividerCol + 1, split.rightWidth, layout.contentRows);
    }

    if (layout.queueBannerRow !== null) {
      paintQueueBanner(this.terminal, layout.queueBannerRow, split.leftWidth, queueLength);
    }

    if (layout.paletteRows.length > 0 && palette !== null) {
      paintCommandPalette(this.terminal, layout.paletteRows, split.leftWidth, palette);
    }

    paintInputLine(this.terminal, layout.inputRow, split.leftWidth, inputState);
    this.paintStatusBarOnTerminal();
    this.terminal.flush();
  }
}
