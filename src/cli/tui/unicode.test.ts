import { describe, it, expect } from 'vitest';

import {
  deleteGraphemeBefore,
  firstGrapheme,
  graphemes,
  isPrintableText,
  moveCursorByGrapheme,
} from './unicode';

describe('graphemes', () => {
  it('keeps Polish diacritics as single units', () => {
    expect(graphemes('żółć')).toEqual(['ż', 'ó', 'ł', 'ć']);
    expect(firstGrapheme('ąę')).toBe('ą');
  });
});

describe('isPrintableText', () => {
  it('accepts ASCII and Polish letters', () => {
    expect(isPrintableText('hello')).toBe(true);
    expect(isPrintableText('zażółć gęślą jaźń')).toBe(true);
    expect(isPrintableText('ó')).toBe(true);
  });

  it('rejects controls and replacement characters', () => {
    expect(isPrintableText('')).toBe(false);
    expect(isPrintableText('\n')).toBe(false);
    expect(isPrintableText('\u007f')).toBe(false);
    expect(isPrintableText('\uFFFD')).toBe(false);
  });
});

describe('deleteGraphemeBefore', () => {
  it('deletes a Polish letter as one character', () => {
    expect(deleteGraphemeBefore('ąć', 2)).toEqual({ text: 'ą', cursor: 1 });
  });
});

describe('moveCursorByGrapheme', () => {
  it('moves across Polish letters', () => {
    expect(moveCursorByGrapheme('ąć', 2, -1)).toBe(1);
    expect(moveCursorByGrapheme('ąć', 1, 1)).toBe(2);
  });
});
