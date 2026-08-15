import { describe, expect, it } from 'vitest';

import { renderStepLines } from './stepsPanel';
import { applyWizardViewEvent, createWizardViewState } from './wizardState';
import { EventLog, formatVirtualWizardEvent } from './eventLog';
import { getBottomLayout } from './virtualWizardRenderer';

describe('getBottomLayout', () => {
  it('reserves only the input row when chrome is inactive', () => {
    expect(getBottomLayout(10, 0, 0)).toEqual({
      contentRows: 9,
      inputRow: 9,
      paletteRows: [],
      queueBannerRow: null,
    });
  });
});

describe('wizard view state', () => {
  it('applies wizard_state snapshots and ignores unrelated events', () => {
    const state = createWizardViewState();
    applyWizardViewEvent(state, { type: 'context_init', changes: [] });
    expect(state.steps).toEqual([]);

    applyWizardViewEvent(state, {
      type: 'wizard_state',
      currentIndex: 1,
      steps: [
        { id: 'welcome', title: 'Welcome', validated: true, lastError: null },
        { id: 'profile', title: 'Your profile', validated: false, lastError: 'name is required.' },
      ],
    });

    expect(state.currentIndex).toBe(1);
    expect(state.steps[0]?.validated).toBe(true);
    expect(state.steps[1]?.lastError).toBe('name is required.');
  });
});

describe('steps panel', () => {
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
});

describe('virtual wizard event log', () => {
  it('formats tool calls and skips wizard_state', () => {
    expect(
      formatVirtualWizardEvent({
        type: 'tool_call',
        name: 'validateCurrentStep',
        args: { name: 'Ada', email: 'ada@example.com' },
        toolCallId: '1',
      }),
    ).toBe('→ validateCurrentStep name=Ada email=ada@example.com');

    expect(
      formatVirtualWizardEvent({
        type: 'wizard_state',
        currentIndex: 0,
        steps: [],
      }),
    ).toBeNull();

    const log = new EventLog();
    log.append({ type: 'user_command', command: 'complete the wizard' });
    log.append({
      type: 'tool_call',
      name: 'nextStep',
      args: {},
      toolCallId: '2',
    });

    expect(log.render(5, 40)).toEqual(['> complete the wizard', '→ nextStep']);
  });
});
