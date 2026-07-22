import type { Harness } from '../harness/harness';
import { emit, HARNESS_PROTOCOL_VERSION, type HarnessCommand } from './jsonl';
import { parseHarnessCommandLine } from './readHarnessCommands';
import type { UserCommandReader } from './readUserCommand';

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function emitHarnessStartup(harness: Harness): void {
  emit({ type: 'ready', protocolVersion: HARNESS_PROTOCOL_VERSION });
  harness.emitSessionStart();
}

export async function runHarnessSession(
  harness: Harness,
  readCommand: () => Promise<string | null>,
): Promise<void> {
  emitHarnessStartup(harness);

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

    try {
      await harness.run(trimmed);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      emit({ type: 'error', message });
    }
  }

  emit({ type: 'session_end', turnCount: harness.getTurnCount() });
}

export async function runHarnessServeSession(
  harness: Harness,
  stdin: NodeJS.ReadableStream = process.stdin,
): Promise<void> {
  emitHarnessStartup(harness);

  let shuttingDown = false;
  let currentAbort: AbortController | null = null;

  await new Promise<void>((resolve, reject) => {
    let buffer = '';
    let commandChain = Promise.resolve();

    const processCommand = async (command: HarnessCommand): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      if (command.type === 'shutdown') {
        shuttingDown = true;
        currentAbort?.abort();
        emit({ type: 'session_end', turnCount: harness.getTurnCount() });
        return;
      }

      if (command.type === 'cancel') {
        currentAbort?.abort();
        return;
      }

      const trimmed = command.command.trim();
      if (trimmed.length === 0) {
        emit({ type: 'error', message: 'Command is required.' });
        return;
      }

      currentAbort = new AbortController();
      try {
        await harness.run(trimmed, { signal: currentAbort.signal });
      } catch (error: unknown) {
        if (isAbortError(error)) {
          emit({ type: 'error', message: 'Cancelled.' });
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          emit({ type: 'error', message });
        }
      } finally {
        currentAbort = null;
      }
    };

    const enqueue = (command: HarnessCommand): void => {
      commandChain = commandChain.then(() => processCommand(command)).catch(reject);
    };

    stdin.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const command = parseHarnessCommandLine(line);
        if (command?.type === 'cancel') {
          currentAbort?.abort();
          continue;
        }

        if (command) {
          enqueue(command);
          continue;
        }

        const trimmed = line.trim();
        if (trimmed.length > 0) {
          emit({ type: 'error', message: `Invalid command line: ${line}` });
        }
      }
    });

    stdin.on('end', () => {
      const command = parseHarnessCommandLine(buffer);
      if (command?.type === 'cancel') {
        currentAbort?.abort();
      } else if (command) {
        enqueue(command);
      }

      commandChain
        .then(() => {
          if (!shuttingDown) {
            emit({ type: 'session_end', turnCount: harness.getTurnCount() });
          }
          resolve();
        })
        .catch(reject);
    });

    stdin.on('error', reject);
  });
}

export async function runHarnessReplSession(harness: Harness, reader: UserCommandReader): Promise<void> {
  await runHarnessSession(harness, async () => {
    const command = await reader.read();
    if (command === null) {
      return null;
    }

    return command;
  });
}
