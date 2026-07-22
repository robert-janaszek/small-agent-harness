import { describe, expect, it } from 'vitest';

import { formatHarnessError } from './formatHarnessError';

describe('formatHarnessError', () => {
  it('formats AggregateError with empty message', () => {
    expect(formatHarnessError(new AggregateError([]))).toBe('AggregateError');
  });

  it('joins nested AggregateError messages', () => {
    expect(
      formatHarnessError(new AggregateError([new Error('auth failed'), new Error('timeout')])),
    ).toBe('auth failed; timeout');
  });

  it('falls back to error name when message is blank', () => {
    expect(formatHarnessError(new Error(''))).toBe('Error');
  });
});
