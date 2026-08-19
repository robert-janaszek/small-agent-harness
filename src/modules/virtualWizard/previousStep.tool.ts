import { defineTool, toolFailure } from '../../tools/defineTool';
import { goToPreviousStep, type WizardContext } from './context';
import { emptyArgsSchema } from './schemas';

export const previousStepTool = defineTool<Record<string, never>, WizardContext>({
  name: 'previousStep',
  description: 'Go back to the previous wizard step. Fails if already on the first step.',
  argsSchema: emptyArgsSchema,
  activity: {
    present: 'going back',
    past: 'went back',
  },
  call(context) {
    const result = goToPreviousStep(context);
    return result.startsWith('Moved back') ? result : toolFailure(result);
  },
});
