import { run } from '../../core/run';
import { createSmartHomeModule } from './module';

const exitCode = await run({
  module: createSmartHomeModule(),
  argv: process.argv.slice(2),
});
process.exit(exitCode);
