import { readHarnessConfigFromEnv, validateHarnessConfig, type HarnessConfig } from './harness.config.validate';

export type { HarnessConfig, HarnessConfigInput } from './harness.config.validate';
export { readHarnessConfigFromEnv, validateHarnessConfig } from './harness.config.validate';

let cachedConfig: HarnessConfig | undefined;

export function getHarnessConfig(): HarnessConfig {
  cachedConfig ??= validateHarnessConfig(readHarnessConfigFromEnv());
  return cachedConfig;
}

export function getOpenaiModelsUrl(): string {
  return `${getHarnessConfig().openaiBaseUrl}/models`;
}
