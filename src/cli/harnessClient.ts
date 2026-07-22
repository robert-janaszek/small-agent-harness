import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { HarnessCommand, HarnessEvent } from './jsonl';

function resolveHarnessEntry(): string {
  return join(process.cwd(), 'src/cli/main.ts');
}

function resolveHarnessSpawnArgs(extraArgs: string[] = []): { cmd: string; args: string[] } {
  const entry = resolveHarnessEntry();
  const tsxBin = join(process.cwd(), 'node_modules/.bin/tsx');

  if (existsSync(tsxBin)) {
    return { cmd: tsxBin, args: [entry, ...extraArgs] };
  }

  return { cmd: 'npx', args: ['tsx', entry, ...extraArgs] };
}

export function spawnHarnessSession(): ReturnType<typeof spawn> {
  const { cmd, args } = resolveHarnessSpawnArgs(['--serve']);
  return spawn(cmd, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });
}

export function writeHarnessCommand(
  stdin: NodeJS.WritableStream,
  command: HarnessCommand,
): void {
  stdin.write(`${JSON.stringify(command)}\n`);
}

export function readHarnessEvents(
  stdout: NodeJS.ReadableStream,
  onEvent: (event: unknown) => void,
  onInvalidLine?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';

    stdout.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) {
          onInvalidLine?.(trimmed);
          continue;
        }

        try {
          onEvent(JSON.parse(trimmed));
        } catch {
          onInvalidLine?.(trimmed);
        }
      }
    });

    stdout.on('end', () => {
      const trimmed = buffer.trim();
      if (trimmed.startsWith('{')) {
        try {
          onEvent(JSON.parse(trimmed));
        } catch {
          onInvalidLine?.(trimmed);
        }
      }
      resolve();
    });

    stdout.on('error', reject);
  });
}

export function isHarnessEvent(raw: unknown): raw is HarnessEvent {
  return typeof raw === 'object' && raw !== null && 'type' in raw;
}

export function isTurnBoundaryEvent(event: HarnessEvent): boolean {
  return event.type === 'agent_response' || event.type === 'error';
}

export class HarnessSessionClient {
  readonly child: ChildProcess;
  private ready = false;
  private contextInitReceived = false;
  private sessionEnded = false;
  private exitCode = 1;
  private readonly eventListeners = new Set<(event: HarnessEvent) => void>();
  private turnWaiter: ((event: HarnessEvent) => void) | null = null;
  private readyWaiter: (() => void) | null = null;
  private contextInitWaiter: ((received: boolean) => void) | null = null;
  private readonly sessionEndedListeners = new Set<() => void>();
  private readonly eventsDone: Promise<void>;

  constructor() {
    this.child = spawnHarnessSession();

    this.child.on('close', (code) => {
      this.exitCode = code ?? 1;
      this.sessionEnded = true;
      this.resolveTurnWaiter({ type: 'error', message: 'Harness process exited.' });
      this.readyWaiter?.();
      this.readyWaiter = null;
      this.resolveContextInitWaiter(false);
      this.notifySessionEnded();
    });

    this.eventsDone = readHarnessEvents(this.child.stdout!, (raw) => {
      if (!isHarnessEvent(raw)) {
        return;
      }

      this.handleEvent(raw);
    });
  }

  onEvent(listener: (event: HarnessEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  onSessionEnded(listener: () => void): () => void {
    if (this.sessionEnded) {
      listener();
      return () => {};
    }

    this.sessionEndedListeners.add(listener);
    return () => {
      this.sessionEndedListeners.delete(listener);
    };
  }

  async waitReady(): Promise<void> {
    if (this.ready) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.readyWaiter = resolve;
    });
  }

  /** Resolves true when context_init arrives, false if the session ends first. */
  async waitForContextInit(): Promise<boolean> {
    if (this.contextInitReceived) {
      return true;
    }

    if (this.sessionEnded) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      this.contextInitWaiter = resolve;
    });
  }

  sendCommand(command: string): void {
    writeHarnessCommand(this.child.stdin!, { type: 'user_command', command });
  }

  cancelTurn(): void {
    if (!this.sessionEnded && this.child.stdin) {
      writeHarnessCommand(this.child.stdin, { type: 'cancel' });
    }
  }

  async waitForTurn(): Promise<HarnessEvent> {
    return new Promise<HarnessEvent>((resolve) => {
      this.turnWaiter = resolve;
    });
  }

  shutdown(): void {
    if (!this.sessionEnded && this.child.stdin) {
      // Cancel first so an in-flight turn aborts before stdin is closed.
      // Otherwise Ctrl+C after /exit cannot write a cancel to an ended stream.
      writeHarnessCommand(this.child.stdin, { type: 'cancel' });
      writeHarnessCommand(this.child.stdin, { type: 'shutdown' });
      this.child.stdin.end();
    }
  }

  async waitForExit(): Promise<number> {
    await this.eventsDone;
    await new Promise<void>((resolve) => {
      if (this.child.exitCode !== null) {
        resolve();
        return;
      }
      this.child.once('close', () => resolve());
    });
    return this.exitCode;
  }

  hasSessionEnded(): boolean {
    return this.sessionEnded;
  }

  private handleEvent(event: HarnessEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }

    if (event.type === 'ready') {
      this.ready = true;
      this.readyWaiter?.();
      this.readyWaiter = null;
    }

    if (event.type === 'context_init') {
      this.contextInitReceived = true;
      this.resolveContextInitWaiter(true);
    }

    if (event.type === 'session_end') {
      this.sessionEnded = true;
      this.resolveContextInitWaiter(false);
      this.notifySessionEnded();
    }

    if (isTurnBoundaryEvent(event)) {
      this.resolveTurnWaiter(event);
    }
  }

  private resolveTurnWaiter(event: HarnessEvent): void {
    if (this.turnWaiter) {
      const waiter = this.turnWaiter;
      this.turnWaiter = null;
      waiter(event);
    }
  }

  private resolveContextInitWaiter(received: boolean): void {
    if (this.contextInitWaiter) {
      const waiter = this.contextInitWaiter;
      this.contextInitWaiter = null;
      waiter(received);
    }
  }

  private notifySessionEnded(): void {
    for (const listener of this.sessionEndedListeners) {
      listener();
    }
    this.sessionEndedListeners.clear();
  }
}
