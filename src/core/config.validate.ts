import { z } from 'zod';

import { formatZodError } from './zod';

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

export const DEFAULT_MAX_COMPLETION_TOKENS = 16384;

const maxCompletionTokensSchema = z.union([z.number(), z.string()]).optional().transform((value, ctx) => {
  if (value === undefined || value === '') {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    ctx.addIssue({ code: 'custom', message: 'HARNESS_MAX_COMPLETION_TOKENS must be a positive integer' });
    return z.NEVER;
  }

  return parsed;
});

const optionalDisplayNameSchema = z.union([z.string(), z.undefined()]).optional().transform((value) => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
});

export const harnessConfigSchema = z.object({
  openaiBaseUrl: openaiBaseUrlSchema,
  openaiApiKey: trimmedNonEmpty('OPENAI_API_KEY is required'),
  modelName: trimmedNonEmpty('MODEL_NAME is required'),
  modelDisplayName: optionalDisplayNameSchema,
  maxIterations: maxIterationsSchema,
  maxCompletionTokens: maxCompletionTokensSchema,
});

export type HarnessConfig = z.infer<typeof harnessConfigSchema>;
export type HarnessConfigInput = z.input<typeof harnessConfigSchema>;

export function readHarnessConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HarnessConfigInput {
  return {
    openaiBaseUrl: env.OPENAI_BASE_URL ?? '',
    openaiApiKey: env.OPENAI_API_KEY ?? '',
    modelName: env.MODEL_NAME ?? '',
    modelDisplayName: env.MODEL_DISPLAY_NAME,
    maxIterations: env.HARNESS_MAX_ITERATIONS ?? '',
    maxCompletionTokens: env.HARNESS_MAX_COMPLETION_TOKENS,
  };
}

export function validateHarnessConfig(input: HarnessConfigInput): HarnessConfig {
  const result = harnessConfigSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(result.error, 'Invalid harness config'));
  }

  return result.data;
}

/** Name shown in Langfuse. Falls back to the API identifier when unset. */
export function tracedModelName(config: { modelName: string; modelDisplayName?: string }): string {
  return config.modelDisplayName ?? config.modelName;
}
