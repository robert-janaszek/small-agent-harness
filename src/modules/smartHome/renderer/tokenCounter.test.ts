import { describe, it, expect } from 'vitest';

import { formatCompactCount, formatTokenCounter } from './tokenCounter';

describe('formatCompactCount', () => {
  it('keeps values under 1000 as-is', () => {
    expect(formatCompactCount(120)).toBe('120');
    expect(formatCompactCount(999)).toBe('999');
  });

  it('formats thousands with one decimal', () => {
    expect(formatCompactCount(16800)).toBe('16.8k');
    expect(formatCompactCount(2468)).toBe('2.5k');
    expect(formatCompactCount(2000)).toBe('2k');
  });

  it('formats large thousands without decimals', () => {
    expect(formatCompactCount(125_000)).toBe('125k');
  });
});

describe('formatTokenCounter', () => {
  it('formats usage with ascii arrows and compact counts', () => {
    expect(
      formatTokenCounter({
        usage: { prompt_tokens: 16800, completion_tokens: 120, total_tokens: 16920 },
        iteration: 3,
      }),
    ).toBe('↑16.8k  ↓120  Σ16.9k  ↻3');
  });

  it('returns empty string when state is null', () => {
    expect(formatTokenCounter(null)).toBe('');
  });
});
