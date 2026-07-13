import './loadEnv';

export const harnessConfig = {
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'http://127.0.0.1:1234/v1',
  openaiApiKey: process.env.OPENAI_API_KEY ?? 'lmstudio',
  modelName: process.env.MODEL_NAME ?? 'google/gemma-3-12b',
  maxIterations: Number(process.env.HARNESS_MAX_ITERATIONS ?? '15'),
};

export const lmStudioModelsUrl = `${harnessConfig.openaiBaseUrl}/models`;
