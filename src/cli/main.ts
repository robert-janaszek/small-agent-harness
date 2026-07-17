import { Harness } from '../harness/harness';
import { createSmartHomeAgent } from '../modules/smartHome/agent';
import { flushLangfuse, initLangfuseTracing } from '../observability/langfuse';
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
  initLangfuseTracing();

  try {
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
      process.exitCode = 1;
      return;
    }

    await harness.run(userCommand);
  } finally {
    await flushLangfuse();
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  emit({ type: 'error', message });
  await flushLangfuse();
  process.exit(1);
});
