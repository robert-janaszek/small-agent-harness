import { Harness } from '../harness/harness';
import { createSmartHomeAgent } from '../modules/smartHome/agent';
import { emit } from './jsonl';
import { readUserCommand } from './readUserCommand';

async function main() {
  const userCommand = await readUserCommand();
  if (!userCommand) {
    emit({ type: 'error', message: 'Command is required.' });
    process.exit(1);
  }

  const harness = new Harness(createSmartHomeAgent());
  await harness.run(userCommand);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  emit({ type: 'error', message });
  process.exit(1);
});
