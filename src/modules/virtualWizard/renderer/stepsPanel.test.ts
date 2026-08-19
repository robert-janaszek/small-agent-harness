import { describe, expect, it } from 'vitest';

import { renderStepLines } from './stepsPanel';

describe('renderStepLines', () => {
  it('marks passed steps and the current step', () => {
    const lines = renderStepLines(
      {
        currentIndex: 1,
        steps: [
          { id: 'welcome', title: 'Welcome', validated: true, lastError: null },
          { id: 'profile', title: 'Your profile', validated: false, lastError: "email must contain '@'." },
          { id: 'plan', title: 'Choose a plan', validated: false, lastError: null },
        ],
      },
      10,
      40,
    );

    const texts = lines.map((line) => line.text);
    expect(texts[0]).toBe('Virtual Wizard');
    expect(lines.find((line) => line.text.includes('Welcome'))?.kind).toBe('passed');
    expect(lines.find((line) => line.text.includes('Your profile'))?.kind).toBe('current');
    expect(lines.find((line) => line.text.includes('Choose a plan'))?.kind).toBe('pending');
    expect(lines.some((line) => line.kind === 'error' && line.text.includes("email must contain '@'"))).toBe(true);
    expect(texts.some((text) => text.startsWith('✓'))).toBe(true);
    expect(texts.some((text) => text.startsWith('>'))).toBe(true);
  });

  it('paints a validated current step as passed while keeping the current marker', () => {
    const lines = renderStepLines(
      {
        currentIndex: 0,
        steps: [{ id: 'welcome', title: 'Welcome', validated: true, lastError: null }],
      },
      5,
      40,
    );

    const current = lines.find((line) => line.text.includes('Welcome'));
    expect(current?.kind).toBe('passed');
    expect(current?.text.startsWith('>')).toBe(true);
  });

  it('shows a placeholder before the first state snapshot', () => {
    const lines = renderStepLines({ currentIndex: 0, steps: [] }, 5, 40);

    expect(lines.some((line) => line.kind === 'empty' && line.text.includes('Waiting for wizard'))).toBe(true);
  });
});
