import { Harness } from '../harness/harness';
import { createYamlRepairAgent } from '../modules/yamlRepair/agent';
import { emit } from './jsonl';
import { createUserCommandReader, readUserCommand } from './readUserCommand';
import { runHarnessReplSession } from './sessionLoop';

const DEFAULT_COMMAND =
  'Repair the YAML work file: fix syntax errors, fill __FILL_FROM_CONTEXT__ from surrounding context, and make sure yamlParse succeeds.';

function parseArgv(argv: string[]): { mode: 'batch' | 'repl'; command: string } {
  const batchCommand = argv.join(' ').trim();
  if (batchCommand.length > 0) {
    return { mode: 'batch', command: batchCommand };
  }
  return { mode: 'repl', command: '' };
}

async function main() {
  const { mode } = parseArgv(process.argv.slice(2));
  const agent = createYamlRepairAgent();
  const harness = new Harness(agent);
  console.error(`[yamlRepair] work file: ${agent.context.filePath}`);

  if (mode === 'repl') {
    const reader = createUserCommandReader();
    try {
      await runHarnessReplSession(harness, reader);
    } finally {
      reader.close();
    }
    return;
  }

  const userCommand = (await readUserCommand(process.argv.slice(2))) || DEFAULT_COMMAND;
  await harness.run(userCommand);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  emit({ type: 'error', message });
  process.exit(1);
});
