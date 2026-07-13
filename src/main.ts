import { Harness } from './harness';
import { createSmartHomeAgent } from './modules/smartHome/agent';
import { readUserCommand } from './readUserCommand';

async function main() {
  const userCommand = await readUserCommand();
  if (!userCommand) {
    console.error('Command is required.');
    process.exit(1);
  }

  const harness = new Harness(createSmartHomeAgent());
  await harness.run(userCommand);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(message);
  process.exit(1);
});
