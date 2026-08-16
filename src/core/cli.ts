import { run } from './run';

const exitCode = await run({ argv: process.argv.slice(2) });
process.exit(exitCode);
