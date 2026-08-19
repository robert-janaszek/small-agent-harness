import { defineTool } from '../../core/tool';
import { resetWizard, type WizardContext } from './context';
import { emptyArgsSchema } from './schemas';

export const resetWizardTool = defineTool<Record<string, never>, WizardContext>({
  name: 'resetWizard',
  description:
    'Reset the wizard to the first step and clear all validation and answers.',
  argsSchema: emptyArgsSchema,
  activity: {
    present: 'resetting wizard',
    past: 'reset wizard',
  },
  call(context) {
    return resetWizard(context);
  },
});
