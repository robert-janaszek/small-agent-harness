import { describe, it, expect } from 'vitest';

import { readUserCommand } from './readUserCommand';

describe('readUserCommand', () => {
  it('joins argv into a batch command', async () => {
    await expect(readUserCommand(['turn', 'off', 'all', 'lights'])).resolves.toBe(
      'turn off all lights',
    );
  });

  it('trims a batch command', async () => {
    await expect(readUserCommand(['  turn off lights  '])).resolves.toBe('turn off lights');
  });
});
