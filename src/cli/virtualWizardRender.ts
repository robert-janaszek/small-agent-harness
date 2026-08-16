import { VirtualWizardRenderer } from '../modules/virtualWizard/renderer/virtualWizardRenderer';
import { VIRTUAL_WIZARD_DEFAULT_COMMAND } from '../modules/virtualWizard/defaultCommand';
import { flushLangfuse, initLangfuseTracing } from '../observability/langfuse';
import { formatHarnessError } from './formatHarnessError';
import { DiffTerminal } from './tui/diffTerminal';

function getTerminalSize(): { rows: number; cols: number } {
  return {
    rows: process.stdout.rows ?? 24,
    cols: process.stdout.columns ?? 80,
  };
}

async function main(): Promise<void> {
  initLangfuseTracing();

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stderr.write('Usage: npm run virtual-wizard [-- <initial-command>]\n');
    process.exit(0);
  }

  if (!process.stdout.isTTY) {
    process.stderr.write('TUI renderer requires an interactive terminal (TTY).\n');
    process.exit(1);
  }

  if (!process.stdin.isTTY) {
    process.stderr.write('TUI renderer requires an interactive terminal (TTY).\n');
    process.exit(1);
  }

  const override = process.argv.slice(2).join(' ').trim();
  const initialCommand = override.length > 0 ? override : VIRTUAL_WIZARD_DEFAULT_COMMAND;
  const { rows, cols } = getTerminalSize();
  const terminal = new DiffTerminal(rows, cols);
  terminal.enter();

  const cleanup = (): void => {
    terminal.leave();
  };

  const renderer = new VirtualWizardRenderer(terminal, initialCommand);
  let terminating = false;

  const terminate = (exitCode: number): void => {
    if (terminating) {
      return;
    }
    terminating = true;
    renderer.shutdown();
    void flushLangfuse().finally(() => {
      cleanup();
      process.exit(exitCode);
    });
  };

  process.stdout.on('resize', () => {
    const size = getTerminalSize();
    terminal.resize(size.rows, size.cols);
    renderer.refresh();
  });

  process.on('SIGINT', () => terminate(130));
  process.on('SIGTERM', () => terminate(143));

  try {
    const exitCode = await renderer.run();
    if (!terminating) {
      cleanup();
      await flushLangfuse();
      process.exit(exitCode);
    }
  } catch (error: unknown) {
    if (!terminating) {
      cleanup();
      process.stderr.write(`${formatHarnessError(error)}\n`);
      await flushLangfuse();
      process.exit(1);
    }
  }
}

main();
