import { Harness } from './harness';
import { createStdoutEmit, encodeEvent } from './protocol';
import { createUserCommandReader, runReplSession, runServeSession } from './session';

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

function writeFatalError(message: string): void {
  process.stdout.write(encodeEvent({ type: 'error', message }));
}

async function main() {
  const { mode, command } = parseArgv(process.argv.slice(2));
  const harness = new Harness({ modules: [], emit: createStdoutEmit() });

  if (mode === 'serve') {
    await runServeSession(harness);
    return;
  }

  if (mode === 'repl') {
    const reader = createUserCommandReader();
    try {
      await runReplSession(harness, () => reader.read());
    } finally {
      reader.close();
    }
    return;
  }

  if (!command) {
    writeFatalError('Command is required.');
    process.exitCode = 1;
    return;
  }

  harness.startSession();
  await harness.run(command);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  writeFatalError(message);
  process.exit(1);
});
