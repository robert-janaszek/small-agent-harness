import { loadEnv } from './loadEnv';
import { readHarnessConfigFromEnv, validateHarnessConfig, type HarnessConfig } from './config.validate';

export type { HarnessConfig, HarnessConfigInput } from './config.validate';
export { readHarnessConfigFromEnv, validateHarnessConfig } from './config.validate';

let cachedConfig: HarnessConfig | undefined;

export function getHarnessConfig(): HarnessConfig {
  loadEnv();
  cachedConfig ??= validateHarnessConfig(readHarnessConfigFromEnv());
  return cachedConfig;
}

export function getOpenaiModelsUrl(): string {
  return `${getHarnessConfig().openaiBaseUrl}/models`;
}
