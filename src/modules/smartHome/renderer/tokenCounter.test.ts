import { describe, it, expect } from 'vitest';

import { formatTokenCounter } from './tokenCounter';

describe('formatTokenCounter', () => {
  it('formats usage with ascii arrows', () => {
    expect(
      formatTokenCounter({
        usage: { prompt_tokens: 2468, completion_tokens: 120, total_tokens: 2588 },
        iteration: 3,
      }),
    ).toBe('↑2468 ↓120 Σ2588 ↻3');
  });

  it('returns empty string when state is null', () => {
    expect(formatTokenCounter(null)).toBe('');
  });
});
