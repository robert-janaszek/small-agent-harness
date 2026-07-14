import { describe, it, expect } from 'vitest';
import { readHarnessConfigFromEnv, validateHarnessConfig } from './harness.config.validate';

const validInput = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'lmstudio',
  modelName: 'google/gemma-3-12b',
  maxIterations: '15',
};

describe('validateHarnessConfig', () => {
  it('accepts valid config', () => {
    expect(validateHarnessConfig(validInput)).toEqual({
      openaiBaseUrl: 'http://127.0.0.1:1234/v1',
      openaiApiKey: 'lmstudio',
      modelName: 'google/gemma-3-12b',
      maxIterations: 15,
    });
  });

  it('trims string values', () => {
    expect(
      validateHarnessConfig({
        ...validInput,
        openaiBaseUrl: ' http://127.0.0.1:1234/v1 ',
        modelName: ' google/gemma-3-12b ',
      }),
    ).toMatchObject({
      openaiBaseUrl: 'http://127.0.0.1:1234/v1',
      modelName: 'google/gemma-3-12b',
    });
  });

  it('rejects missing env values', () => {
    expect(() => validateHarnessConfig(readHarnessConfigFromEnv({}))).toThrow(
      'Invalid harness config:\n- OPENAI_BASE_URL is required\n- OPENAI_API_KEY is required\n- MODEL_NAME is required\n- HARNESS_MAX_ITERATIONS must be a positive integer',
    );
  });

  it('rejects empty OPENAI_BASE_URL', () => {
    expect(() =>
      validateHarnessConfig({ ...validInput, openaiBaseUrl: '   ' }),
    ).toThrow('OPENAI_BASE_URL is required');
  });

  it('rejects invalid OPENAI_BASE_URL', () => {
    expect(() =>
      validateHarnessConfig({ ...validInput, openaiBaseUrl: 'not-a-url' }),
    ).toThrow('OPENAI_BASE_URL must be a valid URL');
  });

  it('rejects unsupported OPENAI_BASE_URL protocol', () => {
    expect(() =>
      validateHarnessConfig({ ...validInput, openaiBaseUrl: 'ftp://127.0.0.1:1234/v1' }),
    ).toThrow('OPENAI_BASE_URL must use http or https');
  });

  it('rejects empty OPENAI_API_KEY', () => {
    expect(() =>
      validateHarnessConfig({ ...validInput, openaiApiKey: '' }),
    ).toThrow('OPENAI_API_KEY is required');
  });

  it('rejects empty MODEL_NAME', () => {
    expect(() =>
      validateHarnessConfig({ ...validInput, modelName: '  ' }),
    ).toThrow('MODEL_NAME is required');
  });

  it('rejects invalid HARNESS_MAX_ITERATIONS', () => {
    expect(() =>
      validateHarnessConfig({ ...validInput, maxIterations: '0' }),
    ).toThrow('HARNESS_MAX_ITERATIONS must be a positive integer');

    expect(() =>
      validateHarnessConfig({ ...validInput, maxIterations: 'abc' }),
    ).toThrow('HARNESS_MAX_ITERATIONS must be a positive integer');
  });
});
