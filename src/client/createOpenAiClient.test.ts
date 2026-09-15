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
import {
  createOpenAiClient,
  toChatCompletionGenerationAttrs,
  toChatCompletionGenerationResultAttrs,
} from './createOpenAiClient';

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

describe('toChatCompletionGenerationResultAttrs', () => {
  const message = { role: 'assistant' as const, content: 'ok', refusal: null };
  const usage = { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 };

  it('records the served model from the completion', () => {
    expect(
      toChatCompletionGenerationResultAttrs(
        {
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: 1,
          model: 'muse-glimmer:30b-mlx',
          choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message }],
          usage,
        },
        'muse-glimmer-harness',
      ),
    ).toEqual({
      output: message,
      usageDetails: { input: 10, output: 4, total: 14 },
      model: 'muse-glimmer:30b-mlx',
      metadata: { requestedModel: 'muse-glimmer-harness' },
    });
  });

  it('omits requestedModel when the API served the requested name', () => {
    expect(
      toChatCompletionGenerationResultAttrs(
        {
          id: 'chatcmpl-1',
          object: 'chat.completion',
          created: 1,
          model: 'test-model',
          choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message }],
        },
        'test-model',
      ),
    ).toEqual({
      output: message,
      usageDetails: undefined,
      model: 'test-model',
    });
  });

  it('omits model from the end-update when the API did not report one', () => {
    const attrs = toChatCompletionGenerationResultAttrs(
      {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1,
        model: '  ',
        choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message }],
      },
      'test-model',
    );

    expect(attrs).toEqual({
      output: message,
      usageDetails: undefined,
    });
    expect(attrs).not.toHaveProperty('model');
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

    expect(withGenerationObservation).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'test-model' }),
      expect.any(Function),
    );
    expect(update).toHaveBeenCalledWith({
      output: { role: 'assistant', content: 'ok', refusal: null },
      usageDetails: { input: 10, output: 4, total: 14 },
    });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('model');
  });

  it('overwrites the generation model with the name the API served', async () => {
    createStream.mockResolvedValue((async function* () {})());
    const update = vi.fn();
    withGenerationObservation.mockImplementationOnce(async (_params, fn) => fn({ update }));
    vi.mocked(consumeChatCompletionStream).mockResolvedValueOnce({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1,
      model: 'served-model',
      choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: 'ok', refusal: null } }],
    });

    const client = createOpenAiClient(testConfig);
    await client.createChatCompletion({ model: 'test-model', messages });

    expect(update).toHaveBeenCalledWith({
      output: { role: 'assistant', content: 'ok', refusal: null },
      usageDetails: undefined,
      model: 'served-model',
      metadata: { requestedModel: 'test-model' },
    });
  });
});
