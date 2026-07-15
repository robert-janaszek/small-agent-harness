import { describe, it, expect } from 'vitest';

import { formatElapsedMs, formatStopwatch, STOPWATCH_TIME_WIDTH, STOPWATCH_WIDTH } from './stopwatch';

describe('formatElapsedMs', () => {
  it('shows tenths of a second under one minute', () => {
    expect(formatElapsedMs(0)).toBe('  0.0');
    expect(formatElapsedMs(1200)).toBe('  1.2');
    expect(formatElapsedMs(45_300)).toBe(' 45.3');
    expect(formatElapsedMs(59_900)).toBe(' 59.9');
  });

  it('switches to mm:ss at one minute', () => {
    expect(formatElapsedMs(60_000)).toBe(' 1:00');
    expect(formatElapsedMs(125_000)).toBe(' 2:05');
    expect(formatElapsedMs(3_599_000)).toBe('59:59');
  });

  it('switches to h:mm at one hour', () => {
    expect(formatElapsedMs(3_600_000)).toBe(' 1:00');
    expect(formatElapsedMs(3_661_000)).toBe(' 1:01');
  });

  it('keeps a fixed-width time field', () => {
    expect(formatElapsedMs(0).length).toBe(STOPWATCH_TIME_WIDTH);
    expect(formatElapsedMs(125_000).length).toBe(STOPWATCH_TIME_WIDTH);
    expect(formatElapsedMs(3_661_000).length).toBe(STOPWATCH_TIME_WIDTH);
  });
});

describe('formatStopwatch', () => {
  it('prefixes the time with a stopwatch symbol', () => {
    expect(formatStopwatch(1200)).toBe('⏱  1.2');
    expect(formatStopwatch(1200).length).toBe(STOPWATCH_WIDTH);
  });
});
