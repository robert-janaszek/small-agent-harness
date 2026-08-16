import * as readline from 'readline/promises';
import { stdin as input, stderr as output } from 'process';

import type { Harness } from './harness';
import { parseCommandLine, type CoreCommand } from './protocol';

export type UserCommandReader = {
  read: () => Promise<string | null>;
  close: () => void;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function createUserCommandReader(): UserCommandReader {
  const rl = readline.createInterface({ input, output });
  let closed = false;

  return {
    async read(): Promise<string | null> {
      if (closed) {
        return null;
      }

      try {
        return (await rl.question('> ')).trim();
      } catch {
        return null;
      }
    },
    close(): void {
      if (!closed) {
        closed = true;
        rl.close();
      }
    },
  };
}

export async function runReplSession(
  harness: Harness,
  readCommand: () => Promise<string | null>,
): Promise<void> {
  harness.startSession();

  while (true) {
    const command = await readCommand();
    if (command === null) {
      break;
    }

    const trimmed = command.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed === '/exit') {
      break;
    }

    if (trimmed === '/reset') {
      harness.resetSession();
      continue;
    }

    try {
      await harness.run(trimmed);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      harness.emitError(message);
    }
  }

  harness.endSession();
}

export async function runServeSession(
  harness: Harness,
  stdin: NodeJS.ReadableStream = process.stdin,
): Promise<void> {
  harness.startSession();

  let shuttingDown = false;
  let currentAbort: AbortController | null = null;

  await new Promise<void>((resolve, reject) => {
    let buffer = '';
    let commandChain = Promise.resolve();

    const processCommand = async (command: CoreCommand): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      if (command.type === 'shutdown') {
        shuttingDown = true;
        currentAbort?.abort();
        harness.endSession();
        return;
      }

      if (command.type === 'reset') {
        harness.resetSession();
        return;
      }

      if (command.type === 'cancel') {
        currentAbort?.abort();
        return;
      }

      const trimmed = command.command.trim();
      if (trimmed.length === 0) {
        harness.emitError('Command is required.');
        return;
      }

      currentAbort = new AbortController();
      try {
        await harness.run(trimmed, { signal: currentAbort.signal });
      } catch (error: unknown) {
        if (isAbortError(error)) {
          if (!shuttingDown) {
            harness.emitError('Cancelled.');
          }
        } else if (!shuttingDown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          harness.emitError(message);
        }
      } finally {
        currentAbort = null;
      }
    };

    const enqueue = (command: CoreCommand): void => {
      commandChain = commandChain.then(() => processCommand(command)).catch(reject);
    };

    stdin.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const command = parseCommandLine(line);
        if (command?.type === 'cancel') {
          currentAbort?.abort();
          continue;
        }

        if (command?.type === 'shutdown') {
          shuttingDown = true;
          currentAbort?.abort();
          harness.endSession();
          continue;
        }

        if (command?.type === 'reset') {
          currentAbort?.abort();
          enqueue(command);
          continue;
        }

        if (command) {
          enqueue(command);
          continue;
        }

        const trimmed = line.trim();
        if (trimmed.length > 0) {
          harness.emitError(`Invalid command line: ${line}`);
        }
      }
    });

    stdin.on('end', () => {
      const command = parseCommandLine(buffer);
      if (command?.type === 'cancel') {
        currentAbort?.abort();
      } else if (command?.type === 'shutdown') {
        shuttingDown = true;
        currentAbort?.abort();
        harness.endSession();
      } else if (command?.type === 'reset') {
        currentAbort?.abort();
        enqueue(command);
      } else if (command) {
        enqueue(command);
      }

      commandChain
        .then(() => {
          if (!shuttingDown) {
            harness.endSession();
          }
          resolve();
        })
        .catch(reject);
    });

    stdin.on('error', reject);
  });
}
