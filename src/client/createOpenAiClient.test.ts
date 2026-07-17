import { afterEach, describe, expect, it, vi } from 'vitest';

const observeOpenAI = vi.hoisted(() =>
  vi.fn((client: unknown) => ({
    ...(client as object),
    __observed: true,
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
);

vi.mock('@langfuse/openai', () => ({
  observeOpenAI,
}));

import { createOpenAiClient } from './createOpenAiClient';

const testConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 3,
};

describe('createOpenAiClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    observeOpenAI.mockClear();
  });

  it('does not wrap with observeOpenAI when Langfuse is disabled', () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', '');
    vi.stubEnv('LANGFUSE_SECRET_KEY', '');

    createOpenAiClient(testConfig);

    expect(observeOpenAI).not.toHaveBeenCalled();
  });

  it('wraps the OpenAI client with observeOpenAI when Langfuse is enabled', () => {
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');

    createOpenAiClient(testConfig);

    expect(observeOpenAI).toHaveBeenCalledTimes(1);
    expect(observeOpenAI).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ generationName: 'chat-completion' }),
    );
  });
});
