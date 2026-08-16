import type { HarnessEvent } from '../../../cli/jsonl';
import { DiffTerminal } from '../../../cli/tui/diffTerminal';
import {
  paintCommandPalette,
  paintInputLine,
  paintQueueBanner,
  TerminalInputLine,
} from '../../../cli/tui/inputPrompt';
import { drawVerticalDivider, getSplitColumns } from '../../../cli/tui/splitLayout';
import { EventLog } from './eventLog';
import { paintStepsPanel, STEPS_PANEL_MIN_WIDTH } from './stepsPanel';
import { VirtualWizardHarnessClient } from './virtualWizardHarnessClient';
import { applyWizardViewEvent, createWizardViewState, resetWizardViewState } from './wizardState';

export type BottomLayout = {
  contentRows: number;
  inputRow: number;
  paletteRows: number[];
  queueBannerRow: number | null;
};

export function getBottomLayout(
  terminalHeight: number,
  queueLength: number,
  paletteRowCount: number,
): BottomLayout {
  const height = Math.max(1, terminalHeight);
  let row = height - 1;
  const inputRow = row;
  row -= 1;

  const paletteRows: number[] = [];
  const rowsToReserve = Math.max(0, paletteRowCount);
  for (let index = 0; index < rowsToReserve && row >= 0; index++) {
    paletteRows.unshift(row);
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
    paletteRows,
    queueBannerRow,
  };
}

export class VirtualWizardRenderer {
  private terminal: DiffTerminal;
  private initialCommand: string | null;
  private client: VirtualWizardHarnessClient | null = null;
  private eventLog = new EventLog();
  private wizardState = createWizardViewState();
  private harnessActive = false;
  private harnessReady = false;
  private inputLine: TerminalInputLine;
  private commandQueue: string[] = [];
  private dispatching = false;
  private interrupted = false;

  constructor(terminal: DiffTerminal, initialCommand: string | null = null) {
    this.terminal = terminal;
    this.initialCommand = initialCommand;
    this.inputLine = new TerminalInputLine(() => {
      this.redraw();
    });
  }

  private clearCommandQueue(): void {
    if (this.commandQueue.length === 0) {
      return;
    }

    this.commandQueue = [];
    this.redraw();
  }

  private requestExit(client: VirtualWizardHarnessClient): void {
    if (this.interrupted || client.hasSessionEnded()) {
      return;
    }

    this.interrupted = true;
    this.clearCommandQueue();
    client.shutdown();
  }

  shutdown(): void {
    const client = this.client;
    if (client) {
      this.requestExit(client);
    }
  }

  async run(): Promise<number> {
    const client = new VirtualWizardHarnessClient();
    this.client = client;
    client.onEvent((event) => this.onEvent(event));

    this.inputLine.setOnInterrupt(() => {
      if (this.harnessReady && this.harnessActive) {
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

      if (command === '/reset') {
        this.clearCommandQueue();
        if (this.harnessActive) {
          client.cancelTurn();
        }
        this.eventLog.clear();
        resetWizardViewState(this.wizardState);
        client.resetSession();
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
    this.inputLine.close();
    this.redraw();

    const exitCode = await client.waitForExit();
    this.client = null;
    return exitCode;
  }

  private async waitForSessionEnd(client: VirtualWizardHarnessClient): Promise<void> {
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

  private async drainQueue(client: VirtualWizardHarnessClient): Promise<void> {
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

  private async runTurn(client: VirtualWizardHarnessClient, command: string): Promise<void> {
    this.harnessActive = true;
    client.sendCommand(command);
    await client.waitForTurn();
    this.harnessActive = false;
    this.redraw();
  }

  refresh(): void {
    this.redraw();
  }

  private redraw(): void {
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
    const rightWidth = Math.max(split.rightWidth, STEPS_PANEL_MIN_WIDTH);

    this.terminal.clear();

    for (let lineRow = 0; lineRow < layout.contentRows; lineRow++) {
      this.terminal.fill(lineRow, 0, (leftLines[lineRow] ?? '').padEnd(split.leftWidth).slice(0, split.leftWidth));
    }

    drawVerticalDivider(this.terminal, split.dividerCol);
    paintStepsPanel(
      this.terminal,
      split.dividerCol + 1,
      rightWidth,
      layout.contentRows,
      this.wizardState,
    );

    if (layout.queueBannerRow !== null) {
      paintQueueBanner(this.terminal, layout.queueBannerRow, split.leftWidth, queueLength);
    }

    if (layout.paletteRows.length > 0 && palette !== null) {
      paintCommandPalette(this.terminal, layout.paletteRows, split.leftWidth, palette);
    }

    paintInputLine(this.terminal, layout.inputRow, split.leftWidth, inputState);
    this.terminal.flush();
  }

  private onEvent(raw: HarnessEvent): void {
    if (raw.type === 'agent_response') {
      if (raw.content.trim().length > 0) {
        this.eventLog.append(raw);
      }
    } else if (
      raw.type !== 'ready' &&
      raw.type !== 'session_end' &&
      raw.type !== 'context_init' &&
      raw.type !== 'wizard_state' &&
      raw.type !== 'tokens'
    ) {
      this.eventLog.append(raw);
    }

    applyWizardViewEvent(this.wizardState, raw);
    this.redraw();
  }
}
