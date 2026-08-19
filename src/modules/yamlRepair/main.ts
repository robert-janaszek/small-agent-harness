import { run } from '../../core/run';
import { YAML_REPAIR_DEFAULT_COMMAND } from './defaultCommand';
import { createYamlRepairModule } from './module';

const argv = process.argv.slice(2);

const exitCode = await run({
  module: createYamlRepairModule(),
  argv,
  defaultCommand: argv.includes('--default') ? YAML_REPAIR_DEFAULT_COMMAND : undefined,
});
process.exit(exitCode);
