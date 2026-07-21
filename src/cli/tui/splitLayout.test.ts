import { describe, expect, it } from 'vitest';

import { getSplitColumns } from './splitLayout';

describe('getSplitColumns', () => {
  it('splits the terminal width evenly with a minimum column size', () => {
    expect(getSplitColumns(80, 0.5)).toEqual({
      leftWidth: 39,
      dividerCol: 39,
      rightWidth: 40,
    });
  });

  it('enforces a minimum width of 20 columns per side', () => {
    expect(getSplitColumns(30, 0.5)).toEqual({
      leftWidth: 20,
      dividerCol: 20,
      rightWidth: 20,
    });
  });
});
