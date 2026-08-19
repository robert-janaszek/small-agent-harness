import { defineTool, toolFailure } from '../../tools/defineTool';
import { goToNextStep, type WizardContext } from './context';
import { emptyArgsSchema } from './schemas';

export const nextStepTool = defineTool<Record<string, never>, WizardContext>({
  name: 'nextStep',
  description:
    'Advance to the next wizard step. Fails if the current step is not validated. ' +
    'Call validateCurrentStep first.',
  argsSchema: emptyArgsSchema,
  activity: {
    present: 'advancing',
    past: 'advanced',
  },
  call(context) {
    const result = goToNextStep(context);
    return result.startsWith('Moved forward') ? result : toolFailure(result);
  },
});
