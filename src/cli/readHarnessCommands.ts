import { isHarnessCommand, type HarnessCommand } from './jsonl';

export function parseHarnessCommandLine(line: string): HarnessCommand | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const raw: unknown = JSON.parse(trimmed);
    return isHarnessCommand(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function readHarnessCommands(
  stdin: NodeJS.ReadableStream,
  onCommand: (command: HarnessCommand) => void | Promise<void>,
  onInvalidLine?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let commandChain = Promise.resolve();

    const enqueue = (command: HarnessCommand): void => {
      commandChain = commandChain.then(() => Promise.resolve(onCommand(command))).catch(reject);
    };

    stdin.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const command = parseHarnessCommandLine(line);
        if (command) {
          enqueue(command);
          continue;
        }

        const trimmed = line.trim();
        if (trimmed.length > 0) {
          onInvalidLine?.(trimmed);
        }
      }
    });

    stdin.on('end', () => {
      const command = parseHarnessCommandLine(buffer);
      if (command) {
        enqueue(command);
      }

      commandChain.then(resolve).catch(reject);
    });

    stdin.on('error', reject);
  });
}
