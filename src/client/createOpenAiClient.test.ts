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

  it('records the traced display name instead of the API identifier', () => {
    expect(
      toChatCompletionGenerationAttrs({ model: 'muse-glimmer-harness', messages }, 'meta/muse-glimmer'),
    ).toEqual({
      name: 'chat-completion',
      input: messages,
      model: 'meta/muse-glimmer',
    });
  });
});

describe('toChatCompletionGenerationResultAttrs', () => {
  const message = { role: 'assistant' as const, content: 'ok', refusal: null };
  const usage = { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 };

  function completionWith(
    model: string,
    assistant: typeof message & { reasoning_content?: string },
    extras: { usage?: typeof usage } = {},
  ) {
    return {
      id: 'chatcmpl-1',
      object: 'chat.completion' as const,
      created: 1,
      model,
      choices: [{ index: 0, finish_reason: 'stop' as const, logprobs: null, message: assistant }],
      ...extras,
    };
  }

  it('does not overwrite the traced model with the served API name', () => {
    const attrs = toChatCompletionGenerationResultAttrs(
      completionWith('muse-glimmer-harness', message, { usage }),
      'muse-glimmer-harness',
      'meta/muse-glimmer',
    );

    expect(attrs).toEqual({
      output: message,
      usageDetails: { input: 10, output: 4, total: 14 },
      metadata: { requestedModel: 'muse-glimmer-harness' },
    });
    expect(attrs).not.toHaveProperty('model');
  });

  it('records servedModel only when it differs from both traced and requested names', () => {
    expect(
      toChatCompletionGenerationResultAttrs(
        completionWith('muse-glimmer:30b-mlx', message),
        'muse-glimmer-harness',
        'meta/muse-glimmer',
      ),
    ).toEqual({
      output: message,
      usageDetails: undefined,
      metadata: {
        requestedModel: 'muse-glimmer-harness',
        servedModel: 'muse-glimmer:30b-mlx',
      },
    });
  });

  it('omits alias metadata when traced, requested, and served names match', () => {
    expect(toChatCompletionGenerationResultAttrs(completionWith('test-model', message), 'test-model')).toEqual({
      output: message,
      usageDetails: undefined,
    });
  });

  it('omits model from the end-update when the API did not report one', () => {
    const attrs = toChatCompletionGenerationResultAttrs(completionWith('  ', message), 'test-model');

    expect(attrs).toEqual({
      output: message,
      usageDetails: undefined,
    });
    expect(attrs).not.toHaveProperty('model');
  });

  it('maps reasoning_content to a Langfuse thinking block next to the answer', () => {
    expect(
      toChatCompletionGenerationResultAttrs(
        completionWith('test-model', { ...message, reasoning_content: 'hmm' }),
        'test-model',
      ),
    ).toEqual({
      output: {
        role: 'assistant',
        content: 'ok',
        refusal: null,
        thinking: [{ type: 'thinking', content: 'hmm' }],
      },
      usageDetails: undefined,
    });
  });

  it('does not duplicate thinking when content is the reasoning fallback', () => {
    expect(
      toChatCompletionGenerationResultAttrs(
        completionWith('test-model', {
          role: 'assistant',
          content: 'thinking about tools',
          refusal: null,
          reasoning_content: 'thinking about tools',
        }),
        'test-model',
      ),
    ).toEqual({
      output: {
        role: 'assistant',
        content: null,
        refusal: null,
        thinking: [{ type: 'thinking', content: 'thinking about tools' }],
      },
      usageDetails: undefined,
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

  it('traces the display name and does not overwrite it with the served API name', async () => {
    createStream.mockResolvedValue((async function* () {})());
    const update = vi.fn();
    withGenerationObservation.mockImplementationOnce(async (_params, fn) => fn({ update }));
    vi.mocked(consumeChatCompletionStream).mockResolvedValueOnce({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1,
      model: 'muse-glimmer-harness',
      choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: 'ok', refusal: null } }],
    });

    const client = createOpenAiClient({
      ...testConfig,
      modelName: 'muse-glimmer-harness',
      modelDisplayName: 'meta/muse-glimmer',
    });
    await client.createChatCompletion({ model: 'muse-glimmer-harness', messages });

    expect(withGenerationObservation).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'meta/muse-glimmer' }),
      expect.any(Function),
    );
    expect(update).toHaveBeenCalledWith({
      output: { role: 'assistant', content: 'ok', refusal: null },
      usageDetails: undefined,
      metadata: { requestedModel: 'muse-glimmer-harness' },
    });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('model');
  });
});
