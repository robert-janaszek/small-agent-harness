import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function resolveHarnessSpawn(command: string): { cmd: string; args: string[] } {
  const entry = join(process.cwd(), 'src/cli/main.ts');
  const argv = command.trim().split(/\s+/).filter(Boolean);
  const tsxBin = join(process.cwd(), 'node_modules/.bin/tsx');

  if (existsSync(tsxBin)) {
    return { cmd: tsxBin, args: [entry, ...argv] };
  }

  return { cmd: 'npx', args: ['tsx', entry, ...argv] };
}

export function spawnHarness(command: string): ReturnType<typeof spawn> {
  const { cmd, args } = resolveHarnessSpawn(command);
  return spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
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
