import { DiffTerminal } from '../cli/tui/diffTerminal';
import { flushLangfuse, initLangfuseTracing } from '../observability/langfuse';
import { createEventBus } from './eventBus';
import { Harness } from './harness';
import type { Module } from './module';
import { createStdoutEmit, encodeEvent } from './protocol';
import { runServeSession } from './session';
import { DefaultRenderer } from './tui/defaultRenderer';

export type RunOptions = {
  module?: Module;
  argv?: string[];
  defaultCommand?: string;
};

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

async function runJsonlSession(module: Module | undefined, command: string, headlessServe: boolean): Promise<number> {
  const bus = createEventBus();
  bus.subscribe(createStdoutEmit());
  const harness = new Harness({ modules: module ? [module] : [], bus });

  if (headlessServe || !command) {
    await runServeSession(harness);
    return 0;
  }

  harness.startSession();
  await harness.run(command);
  return 0;
}

async function runTuiSession(module: Module | undefined, command: string): Promise<number> {
  const bus = createEventBus();
  const harness = new Harness({ modules: module ? [module] : [], bus });
  const { rows, cols } = getTerminalSize();
  const terminal = new DiffTerminal(rows, cols);
  terminal.enter();

  const renderer = new DefaultRenderer(terminal, harness, bus, {
    initialCommand: command || null,
    panel: module?.createPanel?.() ?? null,
  });
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

export async function run(options: RunOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stderr.write('Usage: [-- <command> | --serve]\n');
    return 0;
  }

  initLangfuseTracing();

  try {
    const { mode, command } = parseArgv(argv);
    const resolvedCommand = command || options.defaultCommand || '';

    if (mode === 'serve' || !isTty()) {
      return await runJsonlSession(options.module, resolvedCommand, mode === 'serve');
    }

    return await runTuiSession(options.module, resolvedCommand);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    writeFatalError(message);
    return 1;
  } finally {
    await flushLangfuse();
  }
}
