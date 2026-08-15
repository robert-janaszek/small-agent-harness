import { Harness } from '../harness/harness';
import { createVirtualWizardAgent } from '../modules/virtualWizard/agent';
import { VIRTUAL_WIZARD_DEFAULT_COMMAND } from '../modules/virtualWizard/defaultCommand';
import { flushLangfuse, initLangfuseTracing } from '../observability/langfuse';
import { formatHarnessError } from './formatHarnessError';
import { emit } from './jsonl';
import { createUserCommandReader } from './readUserCommand';
import { runHarnessReplSession, runHarnessServeSession, emitHarnessStartup } from './sessionLoop';

function parseArgv(argv: string[]): { mode: 'batch' | 'repl' | 'serve'; command: string } {
  const serveIndex = argv.indexOf('--serve');
  if (serveIndex !== -1) {
    return { mode: 'serve', command: '' };
  }

  const hasDefault = argv.includes('--default');
  const positional = argv.filter((arg) => arg !== '--default').join(' ').trim();

  if (hasDefault && positional.length > 0) {
    throw new Error('`--default` cannot be combined with a custom command.');
  }

  if (hasDefault) {
    return { mode: 'batch', command: VIRTUAL_WIZARD_DEFAULT_COMMAND };
  }

  if (positional.length > 0) {
    return { mode: 'batch', command: positional };
  }

  return { mode: 'repl', command: '' };
}

async function main() {
  initLangfuseTracing();

  try {
    const { mode, command } = parseArgv(process.argv.slice(2));
    const harness = new Harness(createVirtualWizardAgent());

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

    emitHarnessStartup(harness);
    await harness.run(command);
  } finally {
    await flushLangfuse();
  }
}

main().catch(async (error: unknown) => {
  emit({ type: 'error', message: formatHarnessError(error) });
  await flushLangfuse();
  process.exit(1);
});
