import './loadEnv';
import { readHarnessConfigFromEnv, validateHarnessConfig } from './harness.config.validate';

export type { HarnessConfig, HarnessConfigInput } from './harness.config.validate';
export { readHarnessConfigFromEnv, validateHarnessConfig } from './harness.config.validate';

export const harnessConfig = validateHarnessConfig(readHarnessConfigFromEnv());

export const lmStudioModelsUrl = `${harnessConfig.openaiBaseUrl}/models`;
