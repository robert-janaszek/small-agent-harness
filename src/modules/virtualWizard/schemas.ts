import { z } from 'zod';

export const emptyArgsSchema = z.object({});

export const validateCurrentStepArgsSchema = z.object({
  name: z
    .string()
    .optional()
    .describe('Full name. Required on the profile step (at least 2 characters).'),
  email: z
    .string()
    .optional()
    .describe("Email address. Required on the profile step; must contain '@'."),
  plan: z
    .enum(['free', 'pro'])
    .optional()
    .describe('Plan choice. Required on the plan step: free or pro.'),
});

export type ValidateCurrentStepArgs = z.infer<typeof validateCurrentStepArgsSchema>;
