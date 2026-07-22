import { Harness } from '../harness/harness';
import { createYamlRepairAgent } from '../modules/yamlRepair/agent';
import { flushLangfuse, initLangfuseTracing } from '../observability/langfuse';
import { formatHarnessError } from './formatHarnessError';
import { emit } from './jsonl';
import { installYamlRepairLogWriter } from './yamlRepairLog';

const DEFAULT_COMMAND = `Repair the YAML work file end-to-end:
- Fix all syntax errors reported by yamlParse.
- Replace every __FILL_FROM_CONTEXT__ placeholder using nearby context and site defaults.
- After every replace, call yamlParse before any other tool until the file parses cleanly.
- If yamlParse reports that errors increased, call undo (never reverse the edit with replace), then yamlParse, then retry with a smaller edit.
- When done, reply briefly that the file is valid YAML.`;

function resolveUserCommand(argv: string[]): string {
  const override = argv.join(' ').trim();
  return override.length > 0 ? override : DEFAULT_COMMAND;
}

async function main() {
  initLangfuseTracing();
  installYamlRepairLogWriter();

  const agent = createYamlRepairAgent();
  try {
    const harness = new Harness(agent);
    const userCommand = resolveUserCommand(process.argv.slice(2));

    console.log(`[yamlRepair] work file: ${agent.context.filePath}`);
    await harness.run(userCommand);
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
