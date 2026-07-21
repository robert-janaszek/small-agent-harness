import { afterEach, beforeEach } from 'vitest';

import { resetEmitWriter, setEmitWriter } from '../cli/jsonl';

beforeEach(() => {
  setEmitWriter(() => {});
});

afterEach(() => {
  resetEmitWriter();
});
