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

const HOST_FLAGS = new Set(['--serve', '--jsonl', '--help', '-h']);

export type ParsedRunArgv = {
  serve: boolean;
  jsonl: boolean;
  help: boolean;
  command: string;
};

export type HostMode = 'tui' | 'jsonl-batch' | 'jsonl-serve';

export function parseRunArgv(argv: string[]): ParsedRunArgv {
  return {
    serve: argv.includes('--serve'),
    jsonl: argv.includes('--jsonl'),
    help: argv.includes('--help') || argv.includes('-h'),
    command: argv.filter((arg) => !HOST_FLAGS.has(arg)).join(' ').trim(),
  };
}

export function resolveHostMode(
  parsed: ParsedRunArgv,
  options: { tty: boolean; defaultCommand?: string } = { tty: true },
): { mode: HostMode; command: string } {
  const command = parsed.command || options.defaultCommand || '';
  const tty = options.tty ?? true;

  if (parsed.serve) {
    return { mode: 'jsonl-serve', command: '' };
  }

  if (parsed.jsonl || !tty) {
    if (!command) {
      return { mode: 'jsonl-serve', command: '' };
    }
    return { mode: 'jsonl-batch', command };
  }

  return { mode: 'tui', command };
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
    panelModuleId: module?.id,
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

  const onSigint = (): void => {
    renderer.shutdown(130);
  };

  const onSigterm = (): void => {
    renderer.shutdown(143);
  };

  process.stdout.on('resize', onResize);
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    return await renderer.run();
  } finally {
    process.stdout.off('resize', onResize);
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    leave();
  }
}

export async function run(options: RunOptions = {}): Promise<number> {
  const argv = options.argv ?? process.argv.slice(2);
  const parsed = parseRunArgv(argv);

  if (parsed.help) {
    process.stderr.write('Usage: [--jsonl] [--serve] [-- <command>]\n');
    return 0;
  }

  initLangfuseTracing();

  try {
    const { mode, command } = resolveHostMode(parsed, {
      tty: isTty(),
      defaultCommand: options.defaultCommand,
    });

    if (mode === 'jsonl-serve') {
      return await runJsonlSession(options.module, '', true);
    }

    if (mode === 'jsonl-batch') {
      return await runJsonlSession(options.module, command, false);
    }

    return await runTuiSession(options.module, command);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    writeFatalError(message);
    return 1;
  } finally {
    await flushLangfuse();
  }
}
