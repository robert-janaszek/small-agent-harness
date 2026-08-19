import { run } from '../../core/run';
import { createVirtualWizardModule, resolveVirtualWizardDefaultCommand } from './module';

const argv = process.argv.slice(2);

const exitCode = await run({
  module: createVirtualWizardModule(),
  argv,
  defaultCommand: resolveVirtualWizardDefaultCommand(argv),
});
process.exit(exitCode);
