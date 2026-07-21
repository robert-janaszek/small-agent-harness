import { describe, it, expect } from 'vitest';

import {
  formatCompactCount,
  formatTokenCounter,
  TOKEN_COUNT_FIELD_WIDTH,
  TOKEN_ITERATION_FIELD_WIDTH,
} from './tokenCounter';

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

  it('formats millions with one decimal or rounded whole values', () => {
    expect(formatCompactCount(1_500_000)).toBe('1.5M');
    expect(formatCompactCount(2_000_000)).toBe('2M');
    expect(formatCompactCount(150_000_000)).toBe('150M');
  });
});

describe('formatTokenCounter', () => {
  it('uses fixed-width numeric fields', () => {
    const formatted = formatTokenCounter({
      usage: { prompt_tokens: 16800, completion_tokens: 120, total_tokens: 16920 },
      iteration: 3,
    });

    expect(formatted).toBe('↑16.8k ↓  120 Σ16.9k ↻ 3');
    expect(formatted.length).toBe(
      1 + TOKEN_COUNT_FIELD_WIDTH + 1 + 1 + TOKEN_COUNT_FIELD_WIDTH + 1 + 1 + TOKEN_COUNT_FIELD_WIDTH + 1 + 1 + TOKEN_ITERATION_FIELD_WIDTH,
    );
  });

  it('keeps the same width when values grow', () => {
    const small = formatTokenCounter({
      usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 },
      iteration: 1,
    });
    const large = formatTokenCounter({
      usage: { prompt_tokens: 16800, completion_tokens: 1200, total_tokens: 18000 },
      iteration: 12,
    });

    expect(small.length).toBe(large.length);
  });

  it('returns empty string when state is null', () => {
    expect(formatTokenCounter(null)).toBe('');
  });
});
