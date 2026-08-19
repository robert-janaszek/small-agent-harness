import { defineTool } from '../../tools/defineTool';
import { validateCurrentStep, type WizardContext } from './context';
import { validateCurrentStepArgsSchema, type ValidateCurrentStepArgs } from './schemas';

export const validateCurrentStepTool = defineTool<ValidateCurrentStepArgs, WizardContext>({
  name: 'validateCurrentStep',
  description:
    'Validate the current wizard step. Supply name/email on the profile step and plan on the plan step. ' +
    'nextStep will fail until this returns success.',
  argsSchema: validateCurrentStepArgsSchema,
  activity: {
    present: 'validating',
    past: 'validated',
    target: (args) => {
      const parts = Object.entries(args)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${String(value)}`);
      return parts.length > 0 ? parts.join(' ') : null;
    },
  },
  call(context, args) {
    const incoming: Record<string, string> = {};
    if (args.name !== undefined) {
      incoming.name = args.name;
    }
    if (args.email !== undefined) {
      incoming.email = args.email;
    }
    if (args.plan !== undefined) {
      incoming.plan = args.plan;
    }
    return validateCurrentStep(context, incoming);
  },
});
