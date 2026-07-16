import * as readline from 'readline/promises';
import { stdin as input, stderr as output } from 'process';

export type UserCommandReader = {
  read: () => Promise<string | null>;
  close: () => void;
};

export async function readUserCommand(argv: string[] = process.argv.slice(2)): Promise<string> {
  const batchCommand = argv.join(' ').trim();
  if (batchCommand.length > 0) {
    return batchCommand;
  }

  const reader = createUserCommandReader();
  try {
    const command = await reader.read();
    return command ?? '';
  } finally {
    reader.close();
  }
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
