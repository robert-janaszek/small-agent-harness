import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export async function readUserCommand(argv: string[] = process.argv.slice(2)): Promise<string> {
  const batchCommand = argv.join(' ').trim();
  if (batchCommand.length > 0) {
    return batchCommand;
  }

  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question('> ')).trim();
  } finally {
    rl.close();
  }
}
