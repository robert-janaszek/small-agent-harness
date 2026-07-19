import { Harness } from '../harness/harness';
import { createYamlRepairAgent } from '../modules/yamlRepair/agent';
import { flushLangfuse, initLangfuseTracing } from '../observability/langfuse';
import { emit } from './jsonl';
import { installYamlRepairLogWriter } from './yamlRepairLog';

const DEFAULT_COMMAND = `Repair the YAML work file end-to-end:
- Fix all syntax errors reported by yamlParse.
- Replace every __FILL_FROM_CONTEXT__ placeholder using nearby context and site defaults.
- After every replace, call yamlParse before any other tool until the file parses cleanly.
- When done, reply briefly that the file is valid YAML.`;

function resolveUserCommand(argv: string[]): string {
  const override = argv.join(' ').trim();
  return override.length > 0 ? override : DEFAULT_COMMAND;
}

async function main() {
  initLangfuseTracing();
  installYamlRepairLogWriter();

  try {
    const agent = createYamlRepairAgent();
    const harness = new Harness(agent);
    const userCommand = resolveUserCommand(process.argv.slice(2));

    console.log(`[yamlRepair] work file: ${agent.context.filePath}`);
    await harness.run(userCommand);
  } finally {
    await flushLangfuse();
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  emit({ type: 'error', message });
  await flushLangfuse();
  process.exit(1);
});
