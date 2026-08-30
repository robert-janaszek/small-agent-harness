import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSalesTable } from '../buildSalesTable';

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), 'sales.json');
writeFileSync(fixturePath, `${JSON.stringify(buildSalesTable(), null, 2)}\n`);
process.stderr.write(`[dataTable] wrote ${fixturePath}\n`);
