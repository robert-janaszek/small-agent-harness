import { SmartHomeRenderer } from '../modules/smartHome/renderer/smartHomeRenderer';
import { DiffTerminal } from './tui/diffTerminal';

function getTerminalSize(): { rows: number; cols: number } {
  return {
    rows: process.stdout.rows ?? 24,
    cols: process.stdout.columns ?? 80,
  };
}

async function main(): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stderr.write('TUI renderer requires an interactive terminal (TTY).\n');
    process.exit(1);
  }

  const command = process.argv.slice(2).join(' ').trim() || null;
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stderr.write('Usage: npm start [-- <initial-command>]\n');
    process.exit(0);
  }

  const { rows, cols } = getTerminalSize();
  const terminal = new DiffTerminal(rows, cols);
  terminal.enter();

  const cleanup = (): void => {
    terminal.leave();
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', cleanup);

  process.stdout.on('resize', () => {
    const size = getTerminalSize();
    terminal.resize(size.rows, size.cols);
  });

  const renderer = new SmartHomeRenderer(terminal, command);

  try {
    const exitCode = await renderer.run();
    cleanup();
    process.exit(exitCode);
  } catch (error: unknown) {
    cleanup();
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

main();
