import { describe, it, expect } from 'vitest';

import { activityFrame, ACTIVITY_FRAMES, ACTIVITY_SPINNER_WIDTH, STATUS_BAR_GAP } from './activitySpinner';
import { formatStatusBar, statusBarWidth, TOKEN_COUNTER_WIDTH } from './statusBar';

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
      tokenCounter,
    });

    expect(line.startsWith(`[${activityFrame(2)}]`)).toBe(true);
    expect(line).toContain('↑16.8k');
    expect(line.length).toBe(statusBarWidth(tokenCounter));
  });

  it('shows a checkmark when idle', () => {
    const line = formatStatusBar({
      activityActive: false,
      activityTick: 0,
      tokenCounter: {
        usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 },
        iteration: 1,
      },
    });

    expect(line.startsWith('[✓]')).toBe(true);
  });

  it('keeps status bar width stable', () => {
    expect(statusBarWidth({
      usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 },
      iteration: 1,
    })).toBe(ACTIVITY_SPINNER_WIDTH + STATUS_BAR_GAP + TOKEN_COUNTER_WIDTH);
  });
});
