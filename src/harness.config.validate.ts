export type HarnessConfig = {
  openaiBaseUrl: string;
  openaiApiKey: string;
  modelName: string;
  maxIterations: number;
};

export type HarnessConfigInput = {
  openaiBaseUrl: string;
  openaiApiKey: string;
  modelName: string;
  maxIterations: string | number;
};

export function readHarnessConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HarnessConfigInput {
  return {
    openaiBaseUrl: env.OPENAI_BASE_URL ?? '',
    openaiApiKey: env.OPENAI_API_KEY ?? '',
    modelName: env.MODEL_NAME ?? '',
    maxIterations: env.HARNESS_MAX_ITERATIONS ?? '',
  };
}

export function validateHarnessConfig(input: HarnessConfigInput): HarnessConfig {
  const errors: string[] = [];

  const openaiBaseUrl = input.openaiBaseUrl.trim();
  if (!openaiBaseUrl) {
    errors.push('OPENAI_BASE_URL is required');
  } else {
    try {
      const url = new URL(openaiBaseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('OPENAI_BASE_URL must use http or https');
      }
    } catch {
      errors.push('OPENAI_BASE_URL must be a valid URL');
    }
  }

  const openaiApiKey = input.openaiApiKey.trim();
  if (!openaiApiKey) {
    errors.push('OPENAI_API_KEY is required');
  }

  const modelName = input.modelName.trim();
  if (!modelName) {
    errors.push('MODEL_NAME is required');
  }

  const maxIterations = typeof input.maxIterations === 'number'
    ? input.maxIterations
    : Number(input.maxIterations);
  if (input.maxIterations === '' || !Number.isInteger(maxIterations) || maxIterations < 1) {
    errors.push('HARNESS_MAX_ITERATIONS must be a positive integer');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid harness config:\n- ${errors.join('\n- ')}`);
  }

  return {
    openaiBaseUrl,
    openaiApiKey,
    modelName,
    maxIterations,
  };
}
