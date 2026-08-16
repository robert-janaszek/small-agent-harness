import { describe, it, expect } from 'vitest';

import { activityFrame, ACTIVITY_FRAMES, ACTIVITY_SPINNER_WIDTH, STATUS_BAR_GAP } from './activitySpinner';
import { formatStatusBar, statusBarWidth, TOKEN_COUNTER_WIDTH } from './statusBar';
import { STOPWATCH_WIDTH } from './stopwatch';

describe('activityFrame', () => {
  it('cycles through braille frames', () => {
    expect(activityFrame(0)).toBe(ACTIVITY_FRAMES[0]);
    expect(activityFrame(1)).toBe(ACTIVITY_FRAMES[1]);
    expect(activityFrame(ACTIVITY_FRAMES.length)).toBe(ACTIVITY_FRAMES[0]);
  });
});

describe('formatStatusBar', () => {
  it('shows spinner and fixed-width counters while active', () => {
    const tokenCounter = {
      usage: { prompt_tokens: 16800, completion_tokens: 120, total_tokens: 16920 },
      iteration: 3,
    };

    const line = formatStatusBar({
      activityActive: true,
      activityTick: 2,
      elapsedMs: 1200,
      tokenCounter,
    });

    expect(line.startsWith(`[${activityFrame(2)}]`)).toBe(true);
    expect(line).toContain('⏱  1.2');
    expect(line).toContain('↑16.8k');
    expect(line.length).toBe(statusBarWidth(tokenCounter));
  });

  it('shows a checkmark when idle', () => {
    const line = formatStatusBar({
      activityActive: false,
      activityTick: 0,
      elapsedMs: 45_300,
      tokenCounter: {
        usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 },
        iteration: 1,
      },
    });

    expect(line.startsWith('[✓]')).toBe(true);
    expect(line).toContain('⏱ 45.3');
  });

  it('shows stopwatch even before token counters arrive', () => {
    const line = formatStatusBar({
      activityActive: true,
      activityTick: 0,
      elapsedMs: 500,
      tokenCounter: null,
    });

    expect(line).toBe(`[${activityFrame(0)}]${' '.repeat(STATUS_BAR_GAP)}⏱  0.5`);
    expect(line.length).toBe(statusBarWidth(null));
  });

  it('keeps status bar width stable', () => {
    expect(statusBarWidth({
      usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 },
      iteration: 1,
    })).toBe(ACTIVITY_SPINNER_WIDTH + STATUS_BAR_GAP + STOPWATCH_WIDTH + STATUS_BAR_GAP + TOKEN_COUNTER_WIDTH);
  });
});
