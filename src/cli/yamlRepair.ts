import { Harness } from '../harness/harness';
import { createYamlRepairAgent } from '../modules/yamlRepair/agent';
import { flushLangfuse, initLangfuseTracing } from '../observability/langfuse';
import { emit } from './jsonl';
import { createUserCommandReader, readUserCommand } from './readUserCommand';
import { runHarnessReplSession, runHarnessServeSession, emitHarnessStartup } from './sessionLoop';
import { parseYamlRepairArgv } from './yamlRepairArgv';
import { installYamlRepairLogWriter } from './yamlRepairLog';

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
