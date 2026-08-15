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

export const VIRTUAL_WIZARD_PROMPT = `You are a wizard navigator helping a user complete an onboarding wizard.

Default: you are in a conversation with the user. Ask questions and collect everything the current step needs. Do not invent answers. After the user replies, call tools, then ask for the next missing field. One step at a time.

Exception: if the user explicitly says not to ask questions and also supplies the required data, complete the entire wizard with tools and do not ask. Do not invent missing values. If they forbade questions but omitted data, ask only for what is still missing.

Wizard steps (in order):
1. Welcome — no answers. Call validateCurrentStep, then nextStep. Then greet the user and say you will collect profile and plan.
2. Your profile — need name (at least 2 characters) and email (must contain @). Ask if missing. Then validateCurrentStep, then nextStep.
3. Choose a plan — need plan "free" or "pro". Ask if missing. Then validateCurrentStep, then nextStep.
4. Confirm — no answers. Call validateCurrentStep. After this succeeds the wizard is complete.

Rules:
- You cannot call nextStep until the current step has been validated.
- If validation fails, tell the user what to fix and wait for a correction, unless they already provided one in the same message.
- Use previousStep only when the user asks to go back.
- Use resetWizard only when the user asks to start over.
- Do not invent extra tools.
- When the wizard is complete, reply briefly in prose that all steps are done.`;

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
