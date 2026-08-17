import type { Module, ModulePanel } from '../../core/module';
import type { Tool } from '../../core/tool';
import {
  createContext,
  resetContext,
  snapshotWizardState,
  type WizardStateSnapshot,
} from './context';
import { nextStepTool } from './nextStep.tool';
import { previousStepTool } from './previousStep.tool';
import { paintStepsPanel } from './renderer/stepsPanel';
import { resetWizardTool } from './resetWizard.tool';
import { validateCurrentStepTool } from './validateCurrentStep.tool';

export const VIRTUAL_WIZARD_MODULE_ID = 'virtualWizard';

export const VIRTUAL_WIZARD_START_COMMAND = 'Start the onboarding wizard.';

export const VIRTUAL_WIZARD_PROMPT = `Gather what you need from the user and fill the onboarding wizard with tools.

Listen to the user. Treat their reply as an answer, including "make one up", "whatever", "you decide", or a partial value. If they ask you to invent a field, invent a value that passes validation and continue. Do not insist they type their own real name, email, or plan.
If they tell you to choose, invent, skip, or fill in a value, do that. Do not refuse and re-ask for the same field.

Default: ask for missing information one step at a time. After they answer, call tools, then ask only for what is still missing.

Exception: if they say not to ask questions, complete as far as you can. Invent remaining fields only when they allowed it (for example "fill it in" / "make something up"). Otherwise ask only for what is still missing.

Steps:
1. Welcome — no answers. Call validateCurrentStep, then nextStep, then greet the user and say you will collect profile and plan.
2. Your profile — name (at least 2 characters) and email (must contain @).
3. Choose a plan — "free" or "pro".
4. Confirm — no answers. Call validateCurrentStep. After this succeeds the wizard is complete.

You cannot call nextStep until the current step is validated. Use previousStep or resetWizard only when the user asks.`;

function isWizardStateSnapshot(payload: unknown): payload is WizardStateSnapshot {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const value = payload as { currentIndex?: unknown; steps?: unknown };
  return typeof value.currentIndex === 'number' && Array.isArray(value.steps);
}

export function createVirtualWizardPanel(): ModulePanel {
  let state: WizardStateSnapshot = { currentIndex: 0, steps: [] };

  return {
    onEvent(event, payload) {
      if (event === 'state' && isWizardStateSnapshot(payload)) {
        state = payload;
      }
    },
    paint({ terminal, startCol, width, height }) {
      paintStepsPanel(terminal, startCol, width, height, state);
    },
  };
}

export function createVirtualWizardModule(): Module {
  const context = createContext();
  const emitState = (runtime: { emit: (event: string, payload?: unknown) => void }) => {
    runtime.emit('state', snapshotWizardState(context));
  };

  return {
    id: VIRTUAL_WIZARD_MODULE_ID,
    prompt: VIRTUAL_WIZARD_PROMPT,
    tools: [
      validateCurrentStepTool(context),
      nextStepTool(context),
      previousStepTool(context),
      resetWizardTool(context),
    ] as Tool<any>[],
    createPanel: createVirtualWizardPanel,
    onSessionStart: emitState,
    onSessionReset: (runtime) => {
      resetContext(context);
      emitState(runtime);
    },
    onToolRound: emitState,
  };
}
