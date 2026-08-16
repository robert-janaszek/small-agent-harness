import { WIZARD_STEPS, type WizardStepDefinition } from './steps';

export type WizardStepState = {
  id: string;
  title: string;
  description: string;
  validated: boolean;
  lastError: string | null;
  answers: Record<string, string>;
};

export type WizardContext = {
  currentIndex: number;
  steps: WizardStepState[];
};

export type WizardStateSnapshot = {
  currentIndex: number;
  steps: Array<{
    id: string;
    title: string;
    validated: boolean;
    lastError: string | null;
  }>;
};

function createStepState(definition: WizardStepDefinition): WizardStepState {
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    validated: false,
    lastError: null,
    answers: {},
  };
}

export function createContext(): WizardContext {
  return {
    currentIndex: 0,
    steps: WIZARD_STEPS.map(createStepState),
  };
}

export function resetContext(context: WizardContext): void {
  context.currentIndex = 0;
  context.steps = WIZARD_STEPS.map(createStepState);
}

export function getCurrentStep(context: WizardContext): WizardStepState {
  return context.steps[context.currentIndex]!;
}

export function getCurrentDefinition(context: WizardContext): WizardStepDefinition {
  return WIZARD_STEPS[context.currentIndex]!;
}

export function isOnLastStep(context: WizardContext): boolean {
  return context.currentIndex >= context.steps.length - 1;
}

export function isWizardComplete(context: WizardContext): boolean {
  return isOnLastStep(context) && getCurrentStep(context).validated;
}

export function snapshotWizardState(context: WizardContext): WizardStateSnapshot {
  return {
    currentIndex: context.currentIndex,
    steps: context.steps.map((step) => ({
      id: step.id,
      title: step.title,
      validated: step.validated,
      lastError: step.lastError,
    })),
  };
}

function formatFieldsHint(definition: WizardStepDefinition): string {
  if (definition.fields.length === 0) {
    return 'No answers required.';
  }

  return `Required answers: ${definition.fields
    .map((field) => `${field.name} (${field.hint})`)
    .join(', ')}.`;
}

export function formatWizardStatus(context: WizardContext): string {
  const step = getCurrentStep(context);
  const definition = getCurrentDefinition(context);
  const position = `step ${context.currentIndex + 1}/${context.steps.length} "${step.title}"`;
  const validated = step.validated ? 'validated' : 'not validated';
  const complete = isWizardComplete(context) ? ' The wizard is complete.' : '';

  return `Current ${position} (${validated}). ${formatFieldsHint(definition)}${complete}`;
}

function mergeAnswers(step: WizardStepState, incoming: Record<string, string>): void {
  for (const [key, value] of Object.entries(incoming)) {
    if (value.trim().length > 0) {
      step.answers[key] = value;
    }
  }
}

export function goToNextStep(context: WizardContext): string {
  const current = getCurrentStep(context);
  if (!current.validated) {
    return [
      `Cannot advance: step "${current.title}" is not validated. Call validateCurrentStep first.`,
      formatWizardStatus(context),
    ].join('\n');
  }

  if (isOnLastStep(context)) {
    return [`Already on the last step.`, formatWizardStatus(context)].join('\n');
  }

  context.currentIndex += 1;
  return `Moved forward.\n${formatWizardStatus(context)}`;
}

export function goToPreviousStep(context: WizardContext): string {
  if (context.currentIndex === 0) {
    return [`Already on the first step.`, formatWizardStatus(context)].join('\n');
  }

  context.currentIndex -= 1;
  return `Moved back.\n${formatWizardStatus(context)}`;
}

export function validateCurrentStep(
  context: WizardContext,
  incoming: Record<string, string> = {},
): string {
  const step = getCurrentStep(context);
  const definition = getCurrentDefinition(context);
  mergeAnswers(step, incoming);

  const errors = definition.validate(step.answers);
  if (errors.length > 0) {
    step.validated = false;
    step.lastError = errors.join(' ');
    return [
      `Validation failed for "${step.title}": ${step.lastError}`,
      formatWizardStatus(context),
    ].join('\n');
  }

  step.validated = true;
  step.lastError = null;
  const nextHint = isWizardComplete(context)
    ? 'The wizard is complete.'
    : 'You may call nextStep.';
  return `Validated "${step.title}". ${nextHint}\n${formatWizardStatus(context)}`;
}

export function resetWizard(context: WizardContext): string {
  resetContext(context);
  return `Wizard reset. ${formatWizardStatus(context)}`;
}
