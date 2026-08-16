export type WizardField = {
  name: string;
  label: string;
  hint: string;
};

export type WizardStepDefinition = {
  id: string;
  title: string;
  description: string;
  fields: WizardField[];
  validate: (answers: Record<string, string>) => string[];
};

function requireNonEmpty(value: string | undefined, label: string): string | null {
  if (value === undefined || value.trim().length === 0) {
    return `${label} is required.`;
  }
  return null;
}

export const WIZARD_STEPS: WizardStepDefinition[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'Intro step. No answers required.',
    fields: [],
    validate: () => [],
  },
  {
    id: 'profile',
    title: 'Your profile',
    description: 'Collect a name and email address.',
    fields: [
      { name: 'name', label: 'Full name', hint: 'At least 2 characters' },
      { name: 'email', label: 'Email', hint: 'Must contain @' },
    ],
    validate(answers) {
      const errors: string[] = [];
      const nameError = requireNonEmpty(answers.name, 'name');
      if (nameError) {
        errors.push(nameError);
      } else if (answers.name!.trim().length < 2) {
        errors.push('name must be at least 2 characters.');
      }

      const emailError = requireNonEmpty(answers.email, 'email');
      if (emailError) {
        errors.push(emailError);
      } else if (!answers.email!.includes('@')) {
        errors.push("email must contain '@'.");
      }

      return errors;
    },
  },
  {
    id: 'plan',
    title: 'Choose a plan',
    description: 'Pick a subscription plan.',
    fields: [{ name: 'plan', label: 'Plan', hint: 'free or pro' }],
    validate(answers) {
      const planError = requireNonEmpty(answers.plan, 'plan');
      if (planError) {
        return [planError];
      }

      const plan = answers.plan!.trim().toLowerCase();
      if (plan !== 'free' && plan !== 'pro') {
        return ['plan must be "free" or "pro".'];
      }

      return [];
    },
  },
  {
    id: 'confirm',
    title: 'Confirm',
    description: 'Final review. No answers required.',
    fields: [],
    validate: () => [],
  },
];
