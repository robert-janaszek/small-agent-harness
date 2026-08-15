import { createEventBus } from './eventBus';
import { Harness } from './harness';
import { createStdoutEmit, encodeEvent } from './protocol';
import { runServeSession } from './session';
import { DiffTerminal } from '../cli/tui/diffTerminal';
import { DefaultRenderer } from './tui/defaultRenderer';

function parseArgv(argv: string[]): { mode: 'serve' | 'interactive'; command: string } {
  const serveIndex = argv.indexOf('--serve');
  if (serveIndex !== -1) {
    return { mode: 'serve', command: '' };
  }

  return { mode: 'interactive', command: argv.join(' ').trim() };
}

function isTty(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

function writeFatalError(message: string): void {
  process.stdout.write(encodeEvent({ type: 'error', message }));
}

function getTerminalSize(): { rows: number; cols: number } {
  return {
    rows: process.stdout.rows ?? 24,
    cols: process.stdout.columns ?? 80,
  };
}

async function runJsonlSession(command: string, headlessServe: boolean): Promise<void> {
  const bus = createEventBus();
  bus.subscribe(createStdoutEmit());
  const harness = new Harness({ modules: [], bus });

  if (headlessServe || !command) {
    await runServeSession(harness);
    return;
  }

  harness.startSession();
  await harness.run(command);
}

async function runTuiSession(command: string): Promise<number> {
  const bus = createEventBus();
  const harness = new Harness({ modules: [], bus });
  const { rows, cols } = getTerminalSize();
  const terminal = new DiffTerminal(rows, cols);
  terminal.enter();

  const renderer = new DefaultRenderer(terminal, harness, bus, command || null);
  let leaving = false;

  const leave = (): void => {
    if (leaving) {
      return;
    }
    leaving = true;
    terminal.leave();
  };

  const onResize = (): void => {
    const size = getTerminalSize();
    terminal.resize(size.rows, size.cols);
    renderer.refresh();
  };

  const onSignal = (): void => {
    renderer.shutdown();
  };

  process.stdout.on('resize', onResize);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    return await renderer.run();
  } finally {
    process.stdout.off('resize', onResize);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    leave();
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stderr.write('Usage: npm run core [-- <command> | --serve]\n');
    process.exit(0);
  }

  const { mode, command } = parseArgv(process.argv.slice(2));

  if (mode === 'serve' || !isTty()) {
    await runJsonlSession(command, mode === 'serve');
    return;
  }

  const exitCode = await runTuiSession(command);
  process.exit(exitCode);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  writeFatalError(message);
  process.exit(1);
});
