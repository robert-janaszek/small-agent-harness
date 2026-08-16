import type { HarnessEvent, WizardStatePayload } from '../../../cli/jsonl';

export function createWizardViewState(): WizardStatePayload {
  return {
    currentIndex: 0,
    steps: [],
  };
}

export function resetWizardViewState(state: WizardStatePayload): void {
  state.currentIndex = 0;
  state.steps = [];
}

export function applyWizardViewEvent(state: WizardStatePayload, event: HarnessEvent): void {
  if (event.type !== 'wizard_state') {
    return;
  }

  state.currentIndex = event.currentIndex;
  state.steps = event.steps.map((step) => ({ ...step }));
}
