import * as readline from 'readline/promises';
import { stdin as input, stderr as output } from 'process';

export type InputPrompt = {
  read: () => Promise<string | null>;
  close: () => void;
};

export function createInputPrompt(): InputPrompt {
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
