import { run } from '../../core/run';
import { createDataTableModule } from './module';

const exitCode = await run({
  module: createDataTableModule(),
  argv: process.argv.slice(2),
});
process.exit(exitCode);
