import { describe, it, expect } from 'vitest';

import { getInputLineView, INPUT_PREFIX } from './inputPrompt';

describe('getInputLineView', () => {
  it('renders prefix and value with cursor after text', () => {
    const view = getInputLineView('hello', 5, 20);

    expect(view.line.startsWith(INPUT_PREFIX)).toBe(true);
    expect(view.line.trimEnd()).toBe(`${INPUT_PREFIX}hello`);
    expect(view.cursorCol).toBe(INPUT_PREFIX.length + 5);
  });

  it('scrolls long input to keep cursor visible', () => {
    const value = 'abcdefghijklmnopqrstuvwxyz';
    const view = getInputLineView(value, value.length, 12);

    expect(view.line.length).toBe(12);
    expect(view.cursorCol).toBe(11);
    expect(view.line.endsWith('z')).toBe(true);
  });
});
