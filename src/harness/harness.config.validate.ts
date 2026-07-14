import { z } from 'zod';

import { formatZodError } from '../tools/validation';

function trimmedNonEmpty(message: string) {
  return z.string().transform((value) => value.trim()).pipe(z.string().min(1, message));
}

const openaiBaseUrlSchema = z.string().transform((value) => value.trim()).superRefine((value, ctx) => {
  if (!value) {
    ctx.addIssue({ code: 'custom', message: 'OPENAI_BASE_URL is required' });
    return;
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      ctx.addIssue({ code: 'custom', message: 'OPENAI_BASE_URL must use http or https' });
    }
  } catch {
    ctx.addIssue({ code: 'custom', message: 'OPENAI_BASE_URL must be a valid URL' });
  }
});

const maxIterationsSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  if (value === '') {
    ctx.addIssue({ code: 'custom', message: 'HARNESS_MAX_ITERATIONS must be a positive integer' });
    return z.NEVER;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    ctx.addIssue({ code: 'custom', message: 'HARNESS_MAX_ITERATIONS must be a positive integer' });
    return z.NEVER;
  }

  return parsed;
});

export const harnessConfigSchema = z.object({
  openaiBaseUrl: openaiBaseUrlSchema,
  openaiApiKey: trimmedNonEmpty('OPENAI_API_KEY is required'),
  modelName: trimmedNonEmpty('MODEL_NAME is required'),
  maxIterations: maxIterationsSchema,
});

export type HarnessConfig = z.infer<typeof harnessConfigSchema>;
export type HarnessConfigInput = z.input<typeof harnessConfigSchema>;

export function readHarnessConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HarnessConfigInput {
  return {
    openaiBaseUrl: env.OPENAI_BASE_URL ?? '',
    openaiApiKey: env.OPENAI_API_KEY ?? '',
    modelName: env.MODEL_NAME ?? '',
    maxIterations: env.HARNESS_MAX_ITERATIONS ?? '',
  };
}

export function validateHarnessConfig(input: HarnessConfigInput): HarnessConfig {
  const result = harnessConfigSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(result.error, 'Invalid harness config'));
  }

  return result.data;
}
