import { Harness } from '../harness/harness';
import { createSmartHomeAgent } from '../modules/smartHome/agent';
import { emit } from './jsonl';
import { createUserCommandReader, readUserCommand } from './readUserCommand';
import { runHarnessReplSession, runHarnessServeSession } from './sessionLoop';

function parseArgv(argv: string[]): { mode: 'batch' | 'repl' | 'serve'; command: string } {
  const serveIndex = argv.indexOf('--serve');
  if (serveIndex !== -1) {
    return { mode: 'serve', command: '' };
  }

  const batchCommand = argv.join(' ').trim();
  if (batchCommand.length > 0) {
    return { mode: 'batch', command: batchCommand };
  }

  return { mode: 'repl', command: '' };
}

async function main() {
  const { mode } = parseArgv(process.argv.slice(2));
  const harness = new Harness(createSmartHomeAgent());

  if (mode === 'serve') {
    await runHarnessServeSession(harness);
    return;
  }

  if (mode === 'repl') {
    const reader = createUserCommandReader();
    try {
      await runHarnessReplSession(harness, reader);
    } finally {
      reader.close();
    }
    return;
  }

  const userCommand = await readUserCommand(process.argv.slice(2));
  if (!userCommand) {
    emit({ type: 'error', message: 'Command is required.' });
    process.exit(1);
  }

  await harness.run(userCommand);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  emit({ type: 'error', message });
  process.exit(1);
});
