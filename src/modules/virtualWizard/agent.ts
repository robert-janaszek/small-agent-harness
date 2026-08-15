import { Agent } from '../../harness/agent.type';
import { createContext, resetContext, type WizardContext } from './context';
import { nextStepTool } from './nextStep.tool';
import { previousStepTool } from './previousStep.tool';
import { emitVirtualWizardContextInit, emitWizardState } from './protocol';
import { resetWizardTool } from './resetWizard.tool';
import { validateCurrentStepTool } from './validateCurrentStep.tool';

const VIRTUAL_WIZARD_PROMPT = `You are a wizard navigator. Complete the onboarding wizard using tools only.

There is no human-in-the-loop. Do not ask questions. Do not invent extra tools.

Wizard steps (in order):
1. Welcome — no answers. Call validateCurrentStep, then nextStep.
2. Your profile — provide name (at least 2 characters) and email (must contain @) to validateCurrentStep, then nextStep.
3. Choose a plan — provide plan "free" or "pro" to validateCurrentStep, then nextStep.
4. Confirm — no answers. Call validateCurrentStep. After this succeeds the wizard is complete.

Rules:
- You cannot call nextStep until the current step has been validated.
- If validation fails, fix the answers and call validateCurrentStep again. Do not call nextStep.
- Use previousStep only when the user asks to go back.
- Use resetWizard only when the user asks to start over.
- When the wizard is complete, reply briefly in prose that all steps are done.`;

export type VirtualWizardAgent = Agent & { context: WizardContext };

export function createVirtualWizardAgent(): VirtualWizardAgent {
  const context = createContext();

  return {
    context,
    onSessionStart: () => emitVirtualWizardContextInit(context),
    onSessionReset: () => {
      resetContext(context);
      emitVirtualWizardContextInit(context);
    },
    onToolRound: () => emitWizardState(context),
    prompt: VIRTUAL_WIZARD_PROMPT,
    tools: [
      validateCurrentStepTool(context),
      nextStepTool(context),
      previousStepTool(context),
      resetWizardTool(context),
    ],
  };
}
