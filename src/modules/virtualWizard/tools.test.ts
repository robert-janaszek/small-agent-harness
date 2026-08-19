import { describe, expect, it } from 'vitest';

import {
  createContext,
  goToNextStep,
  goToPreviousStep,
  resetWizard,
  validateCurrentStep,
} from './context';
import { createVirtualWizardModule } from './module';
import { formatToolActivity, indexToolActivity } from '../../core/tui/toolActivity';

describe('virtualWizard navigation', () => {
  it('refuses nextStep until the current step is validated', () => {
    const context = createContext();
    const result = goToNextStep(context);

    expect(result).toContain('not validated');
    expect(context.currentIndex).toBe(0);
  });

  it('advances after a successful validation', () => {
    const context = createContext();
    expect(validateCurrentStep(context)).toContain('Validated "Welcome"');
    expect(goToNextStep(context)).toContain('Moved forward');
    expect(context.currentIndex).toBe(1);
    expect(context.steps[0]?.validated).toBe(true);
  });

  it('rejects profile validation without name and email', () => {
    const context = createContext();
    validateCurrentStep(context);
    goToNextStep(context);

    const result = validateCurrentStep(context);
    expect(result).toContain('Validation failed');
    expect(result).toContain('name is required');
    expect(context.steps[1]?.validated).toBe(false);
    expect(goToNextStep(context)).toContain('not validated');
  });

  it('rejects an email without @', () => {
    const context = createContext();
    validateCurrentStep(context);
    goToNextStep(context);

    const result = validateCurrentStep(context, { name: 'Ada', email: 'ada.example.com' });
    expect(result).toContain("email must contain '@'");
    expect(context.steps[1]?.validated).toBe(false);
  });

  it('accepts a valid profile then a plan and can complete the wizard', () => {
    const context = createContext();
    validateCurrentStep(context);
    goToNextStep(context);
    validateCurrentStep(context, { name: 'Ada Lovelace', email: 'ada@example.com' });
    goToNextStep(context);
    validateCurrentStep(context, { plan: 'pro' });
    goToNextStep(context);

    const result = validateCurrentStep(context);
    expect(result).toContain('The wizard is complete');
    expect(context.currentIndex).toBe(3);
    expect(context.steps.every((step) => step.validated)).toBe(true);
    expect(goToNextStep(context)).toContain('Already on the last step');
  });

  it('refuses previousStep on the first step and returns after going back', () => {
    const context = createContext();
    expect(goToPreviousStep(context)).toContain('Already on the first step');

    validateCurrentStep(context);
    goToNextStep(context);
    expect(goToPreviousStep(context)).toContain('Moved back');
    expect(context.currentIndex).toBe(0);
    expect(goToNextStep(context)).toContain('Moved forward');
  });

  it('resetWizard returns to the first step and clears validation', () => {
    const context = createContext();
    validateCurrentStep(context);
    goToNextStep(context);
    validateCurrentStep(context, { name: 'Ada', email: 'ada@example.com' });

    const result = resetWizard(context);
    expect(result).toContain('Wizard reset');
    expect(context.currentIndex).toBe(0);
    expect(context.steps.every((step) => !step.validated)).toBe(true);
    expect(context.steps[1]?.answers).toEqual({});
  });
});

describe('virtualWizard tools', () => {
  it('wires next, previous, validate, and reset tools against shared context', async () => {
    const module = createVirtualWizardModule();
    const byName = Object.fromEntries((module.tools ?? []).map((tool) => [tool.function.name, tool]));

    expect(await byName.nextStep!.call({})).toContain('not validated');
    expect(await byName.validateCurrentStep!.call({})).toContain('Validated "Welcome"');
    expect(await byName.nextStep!.call({})).toContain('Moved forward');
    expect(await byName.previousStep!.call({})).toContain('Moved back');
    expect(await byName.resetWizard!.call({})).toContain('Wizard reset');
    expect(module.context.currentIndex).toBe(0);
  });
});

describe('virtualWizard tool activity', () => {
  const activities = indexToolActivity(createVirtualWizardModule().tools ?? []);

  function format(name: string, args: unknown, status: 'running' | 'done' | 'failed'): string {
    return formatToolActivity(name, args, status, activities.get(name));
  }

  it.each([
    [
      'validateCurrentStep',
      { name: 'Ada', email: 'a@b.c', plan: 'pro' },
      'validating name=Ada email=a@b.c plan=pro',
      'validated name=Ada email=a@b.c plan=pro',
    ],
    ['nextStep', {}, 'advancing', 'advanced'],
    ['previousStep', {}, 'going back', 'went back'],
    ['resetWizard', {}, 'resetting wizard', 'reset wizard'],
  ] as const)('%s present/past', (name, args, running, done) => {
    expect(format(name, args, 'running')).toBe(running);
    expect(format(name, args, 'done')).toBe(done);
  });
});
