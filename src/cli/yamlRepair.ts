import { Harness } from '../harness/harness';
import { createYamlRepairAgent } from '../modules/yamlRepair/agent';
import { flushLangfuse, initLangfuseTracing } from '../observability/langfuse';
import { formatHarnessError } from './formatHarnessError';
import { emit } from './jsonl';
import { createUserCommandReader } from './readUserCommand';
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

    emitHarnessStartup(harness);
    await harness.run(command);
  } finally {
    agent.context.history.clear();
    await flushLangfuse();
  }
}

main().catch(async (error: unknown) => {
  emit({ type: 'error', message: formatHarnessError(error) });
  await flushLangfuse();
  process.exit(1);
});
