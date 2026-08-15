import { run } from '../../core/run';
import { createVirtualWizardModule, VIRTUAL_WIZARD_START_COMMAND } from './module';

const exitCode = await run({
  module: createVirtualWizardModule(),
  argv: process.argv.slice(2),
  defaultCommand: VIRTUAL_WIZARD_START_COMMAND,
});
process.exit(exitCode);
