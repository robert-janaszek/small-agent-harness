import { Harness } from '../harness/harness';
import { createYamlRepairAgent } from '../modules/yamlRepair/agent';
import { YAML_REPAIR_DEFAULT_COMMAND } from '../modules/yamlRepair/defaultCommand';
import { flushLangfuse, initLangfuseTracing } from '../observability/langfuse';
import { emit } from './jsonl';
import { createUserCommandReader, readUserCommand } from './readUserCommand';
import { runHarnessReplSession, runHarnessServeSession, emitHarnessStartup } from './sessionLoop';
import { installYamlRepairLogWriter } from './yamlRepairLog';

export type YamlRepairCliMode = 'batch' | 'repl' | 'serve';

export function parseYamlRepairArgv(argv: string[]): {
  mode: YamlRepairCliMode;
  command: string;
  human: boolean;
} {
  const human = argv.includes('--human');
  const filtered = argv.filter((arg) => arg !== '--human');

  if (filtered.includes('--default')) {
    const withoutDefault = filtered.filter((arg) => arg !== '--default');
    if (withoutDefault.length > 0) {
      return { mode: 'batch', command: withoutDefault.join(' ').trim(), human };
    }
    return { mode: 'batch', command: YAML_REPAIR_DEFAULT_COMMAND, human };
  }

  const serveIndex = filtered.indexOf('--serve');
  if (serveIndex !== -1) {
    return { mode: 'serve', command: '', human };
  }

  const batchCommand = filtered.join(' ').trim();
  if (batchCommand.length > 0) {
    return { mode: 'batch', command: batchCommand, human };
  }

  return { mode: 'repl', command: '', human };
}

async function main() {
  initLangfuseTracing();

  const { mode, command, human } = parseYamlRepairArgv(process.argv.slice(2));
  if (human) {
    installYamlRepairLogWriter();
  }

  const agent = createYamlRepairAgent();

  try {
    const harness = new Harness(agent);

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

    const userCommand = command.length > 0 ? command : await readUserCommand([]);
    if (!userCommand) {
      emit({ type: 'error', message: 'Command is required.' });
      process.exitCode = 1;
      return;
    }

    emitHarnessStartup(harness);
    await harness.run(userCommand);
  } finally {
    agent.context.history.clear();
    await flushLangfuse();
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  emit({ type: 'error', message });
  await flushLangfuse();
  process.exit(1);
});
