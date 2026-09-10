import { afterEach, describe, expect, it, vi } from 'vitest';

const withGenerationObservation = vi.hoisted(() =>
  vi.fn(async (_params: unknown, fn: (observation: { update: (attrs: unknown) => void }) => Promise<unknown>) =>
    fn({ update: vi.fn() }),
  ),
);

const createStream = vi.hoisted(() => vi.fn());

vi.mock('../observability/langfuse', () => ({
  withGenerationObservation,
}));

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: createStream,
      },
    };
  },
}));

vi.mock('./assembleChatCompletionStream', () => ({
  consumeChatCompletionStream: vi.fn(async () => ({
    choices: [{ message: { role: 'assistant', content: 'ok', refusal: null } }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
  })),
}));

import { consumeChatCompletionStream } from './assembleChatCompletionStream';
import { createOpenAiClient, toChatCompletionGenerationAttrs } from './createOpenAiClient';

const testConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 3,
};

const messages = [{ role: 'user' as const, content: 'hello' }];

const bulkyTool = {
  type: 'function' as const,
  function: {
    name: 'filterRows',
    description: 'Keep matching rows',
    parameters: {
      type: 'object',
      properties: {
        clauses: { type: 'array', items: { type: 'object' } },
      },
    },
  },
};

describe('toChatCompletionGenerationAttrs', () => {
  it('sends messages as input and tool names in metadata, not schemas', () => {
    const attrs = toChatCompletionGenerationAttrs({
      model: 'test-model',
      messages,
      max_tokens: 512,
      tools: [bulkyTool],
      tool_choice: 'auto',
    });

    expect(attrs).toEqual({
      name: 'chat-completion',
      input: messages,
      model: 'test-model',
      modelParameters: { max_tokens: 512, tool_choice: 'auto' },
      metadata: { tools: ['filterRows'] },
    });
    expect(JSON.stringify(attrs)).not.toContain('Keep matching rows');
    expect(JSON.stringify(attrs)).not.toContain('clauses');
  });

  it('omits tools metadata when the request has no tools', () => {
    expect(
      toChatCompletionGenerationAttrs({
        model: 'test-model',
        messages,
      }),
    ).toEqual({
      name: 'chat-completion',
      input: messages,
      model: 'test-model',
    });
  });
});

describe('createOpenAiClient', () => {
  afterEach(() => {
    withGenerationObservation.mockClear();
    createStream.mockReset();
  });

  it('traces chat completions with sanitized generation attrs', async () => {
    createStream.mockResolvedValue((async function* () {})());

    const client = createOpenAiClient(testConfig);
    await client.createChatCompletion({
      model: 'test-model',
      messages,
      tools: [bulkyTool],
      tool_choice: 'auto',
      max_tokens: 128,
    });

    expect(withGenerationObservation).toHaveBeenCalledTimes(1);
    expect(withGenerationObservation).toHaveBeenCalledWith(
      toChatCompletionGenerationAttrs({
        model: 'test-model',
        messages,
        tools: [bulkyTool],
        tool_choice: 'auto',
        max_tokens: 128,
      }),
      expect.any(Function),
    );
    expect(createStream).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [bulkyTool],
        stream: true,
      }),
      expect.anything(),
    );
    expect(consumeChatCompletionStream).toHaveBeenCalled();
  });

  it('records assembled output and usage on the generation', async () => {
    createStream.mockResolvedValue((async function* () {})());
    const update = vi.fn();
    withGenerationObservation.mockImplementationOnce(async (_params, fn) => fn({ update }));

    const client = createOpenAiClient(testConfig);
    await client.createChatCompletion({ model: 'test-model', messages });

    expect(update).toHaveBeenCalledWith({
      output: { role: 'assistant', content: 'ok', refusal: null },
      usageDetails: { input: 10, output: 4, total: 14 },
    });
  });
});
