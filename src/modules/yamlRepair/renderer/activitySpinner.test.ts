import { describe, expect, it } from 'vitest';

import { colors } from '../../../cli/tui/colors';
import { ACTIVITY_FRAMES, activityFrame, paintActivitySpinnerSegments } from './activitySpinner';

describe('activityFrame', () => {
  it('cycles through braille frames', () => {
    expect(activityFrame(0)).toBe(ACTIVITY_FRAMES[0]);
    expect(activityFrame(1)).toBe(ACTIVITY_FRAMES[1]);
    expect(activityFrame(ACTIVITY_FRAMES.length)).toBe(ACTIVITY_FRAMES[0]);
  });

  it('wraps negative ticks back into range', () => {
    expect(activityFrame(-1)).toBe(ACTIVITY_FRAMES[ACTIVITY_FRAMES.length - 1]);
  });
});

describe('paintActivitySpinnerSegments', () => {
  it('renders an animated spinner while active', () => {
    expect(paintActivitySpinnerSegments(true, 2)).toEqual([
      { text: '[', fg: colors.text },
      { text: activityFrame(2), fg: colors.cursor },
      { text: ']', fg: colors.text },
    ]);
  });

  it('renders a success checkmark while idle', () => {
    expect(paintActivitySpinnerSegments(false, 0)).toEqual([
      { text: '[', fg: colors.success },
      { text: '✓', fg: colors.success },
      { text: ']', fg: colors.success },
    ]);
  });
});
