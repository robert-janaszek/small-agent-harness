import type { Harness } from '../harness/harness';
import { emit, HARNESS_PROTOCOL_VERSION } from './jsonl';
import { readHarnessCommands } from './readHarnessCommands';
import type { UserCommandReader } from './readUserCommand';

export async function runHarnessSession(
  harness: Harness,
  readCommand: () => Promise<string | null>,
): Promise<void> {
  emit({ type: 'ready', protocolVersion: HARNESS_PROTOCOL_VERSION });

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
  emit({ type: 'ready', protocolVersion: HARNESS_PROTOCOL_VERSION });

  let shuttingDown = false;

  await readHarnessCommands(
    stdin,
    async (command) => {
      if (shuttingDown) {
        return;
      }

      if (command.type === 'shutdown') {
        shuttingDown = true;
        emit({ type: 'session_end', turnCount: harness.getTurnCount() });
        return;
      }

      const trimmed = command.command.trim();
      if (trimmed.length === 0) {
        emit({ type: 'error', message: 'Command is required.' });
        return;
      }

      try {
        await harness.run(trimmed);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        emit({ type: 'error', message });
      }
    },
    (line) => {
      emit({ type: 'error', message: `Invalid command line: ${line}` });
    },
  );

  if (!shuttingDown) {
    emit({ type: 'session_end', turnCount: harness.getTurnCount() });
  }
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
