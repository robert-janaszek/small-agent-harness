import { describe, expect, it } from 'vitest';

import { getSplitColumns } from './splitLayout';

describe('getSplitColumns', () => {
  it('splits the terminal width evenly with a divider between panes', () => {
    expect(getSplitColumns(80, 0.5)).toEqual({
      leftWidth: 39,
      dividerCol: 39,
      rightWidth: 40,
    });
  });

  it('keeps left + divider + right within the terminal width', () => {
    expect(getSplitColumns(30, 0.5)).toEqual({
      leftWidth: 14,
      dividerCol: 14,
      rightWidth: 15,
    });
    const split = getSplitColumns(30, 0.5);
    expect(split.leftWidth + 1 + split.rightWidth).toBe(30);
  });
});
