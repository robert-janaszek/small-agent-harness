import { describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';

import {
  consumeChatCompletionStream,
  createChatCompletionStreamAssembler,
} from './assembleChatCompletionStream';

type ChatCompletionChunk = OpenAI.Chat.Completions.ChatCompletionChunk;

function chunk(
  delta: ChatCompletionChunk['choices'][number]['delta'],
  extras: Partial<ChatCompletionChunk> & {
    finish_reason?: ChatCompletionChunk['choices'][number]['finish_reason'];
  } = {},
): ChatCompletionChunk {
  const { finish_reason = null, ...rest } = extras;
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'test-model',
    choices: [
      {
        index: 0,
        delta,
        finish_reason,
        logprobs: null,
      },
    ],
    ...rest,
  };
}

describe('createChatCompletionStreamAssembler', () => {
  it('concatenates content chunks and keeps usage from the last chunk', () => {
    const assembler = createChatCompletionStreamAssembler();

    expect(assembler.push(chunk({ role: 'assistant', content: 'Hel' }))).toEqual({
      textDelta: 'Hel',
    });
    expect(assembler.push(chunk({ content: 'lo' }, { finish_reason: 'stop' }))).toEqual({
      textDelta: 'lo',
    });
    expect(
      assembler.push({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'test-model',
        choices: [],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      }),
    ).toEqual({});

    expect(assembler.toChatCompletion()).toEqual({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1,
      model: 'test-model',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          logprobs: null,
          message: { role: 'assistant', content: 'Hello', refusal: null },
        },
      ],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
    });
  });

  it('merges tool_calls by index and stops emitting text deltas', () => {
    const assembler = createChatCompletionStreamAssembler();

    expect(
      assembler.push(
        chunk({
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'echo', arguments: '' },
            },
          ],
        }),
      ),
    ).toEqual({
      becameToolCall: true,
      startedToolCalls: [{ id: 'call_1', name: 'echo' }],
    });

    expect(
      assembler.push(
        chunk({
          tool_calls: [
            {
              index: 0,
              function: { arguments: '{"text":' },
            },
          ],
        }),
      ),
    ).toEqual({});

    expect(
      assembler.push(
        chunk(
          {
            tool_calls: [
              {
                index: 0,
                function: { arguments: '"hi"}' },
              },
            ],
          },
          { finish_reason: 'tool_calls' },
        ),
      ),
    ).toEqual({});

    const completion = assembler.toChatCompletion();
    expect(completion.choices[0]?.finish_reason).toBe('tool_calls');
    expect(completion.choices[0]?.message.tool_calls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'echo', arguments: '{"text":"hi"}' },
      },
    ]);
  });

  it('streams reasoning until content arrives, then uses content as the message', () => {
    const assembler = createChatCompletionStreamAssembler();

    expect(
      assembler.push(
        chunk({
          role: 'assistant',
          reasoning_content: 'hmm',
        } as ChatCompletionChunk['choices'][number]['delta']),
      ),
    ).toEqual({ reasoningDelta: 'hmm' });
    expect(assembler.push(chunk({ content: 'ok' }, { finish_reason: 'stop' }))).toEqual({
      textDelta: 'ok',
    });

    expect(assembler.toChatCompletion().choices[0]?.message.content).toBe('ok');
    expect(
      (assembler.toChatCompletion().choices[0]?.message as { reasoning_content?: string }).reasoning_content,
    ).toBe('hmm');
  });

  it('falls back to reasoning when the model never produced content', () => {
    const assembler = createChatCompletionStreamAssembler();
    assembler.push(
      chunk({
        role: 'assistant',
        reasoning: 'thinking about tools',
      } as ChatCompletionChunk['choices'][number]['delta']),
    );
    assembler.push(chunk({}, { finish_reason: 'length' }));

    expect(assembler.toChatCompletion().choices[0]?.message.content).toBe('thinking about tools');
    expect(
      (assembler.toChatCompletion().choices[0]?.message as { reasoning_content?: string }).reasoning_content,
    ).toBe('thinking about tools');
    expect(assembler.toChatCompletion().choices[0]?.finish_reason).toBe('length');
  });

  it('does not copy reasoning into content when the model also emitted tool calls', () => {
    const assembler = createChatCompletionStreamAssembler();
    assembler.push(
      chunk({
        role: 'assistant',
        reasoning_content: 'I should call listDevices',
      } as ChatCompletionChunk['choices'][number]['delta']),
    );
    assembler.push(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'listDevices', arguments: '{}' },
          },
        ],
      }),
    );
    assembler.push(chunk({}, { finish_reason: 'tool_calls' }));

    const completion = assembler.toChatCompletion();
    expect(completion.choices[0]?.message.content).toBeNull();
    expect((completion.choices[0]?.message as { reasoning_content?: string }).reasoning_content).toBe(
      'I should call listDevices',
    );
    expect(completion.choices[0]?.message.tool_calls?.[0]).toMatchObject({
      function: { name: 'listDevices', arguments: '{}' },
    });
  });

  it('reads reasoning from content parts used by some local servers', () => {
    const assembler = createChatCompletionStreamAssembler();
    assembler.push(
      chunk({
        role: 'assistant',
        reasoning_content: [{ type: 'text', text: 'hmm' }],
      } as ChatCompletionChunk['choices'][number]['delta']),
    );

    expect(assembler.toChatCompletion().choices[0]?.message.content).toBe('hmm');
    expect(
      (assembler.toChatCompletion().choices[0]?.message as { reasoning_content?: string }).reasoning_content,
    ).toBe('hmm');
  });

  it('reads text from content parts used by some local servers', () => {
    const assembler = createChatCompletionStreamAssembler();
    assembler.push(
      chunk({
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi' }],
      } as ChatCompletionChunk['choices'][number]['delta']),
    );

    expect(assembler.toChatCompletion().choices[0]?.message.content).toBe('Hi');
  });

  it('returns empty choices when the stream never produced a message', () => {
    const assembler = createChatCompletionStreamAssembler();
    expect(assembler.toChatCompletion().choices).toEqual([]);
  });
});

describe('consumeChatCompletionStream', () => {
  it('forwards content deltas until tool_calls appear, then cancels', async () => {
    const onTextDelta = vi.fn();
    const onTextDeltaCancel = vi.fn();

    async function* stream(): AsyncGenerator<ChatCompletionChunk> {
      yield chunk({ role: 'assistant', content: 'think' });
      yield chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'echo', arguments: '{}' },
          },
        ],
      });
      yield chunk({ content: 'more' }, { finish_reason: 'tool_calls' });
    }

    const completion = await consumeChatCompletionStream(stream(), {
      onTextDelta,
      onTextDeltaCancel,
    });

    expect(onTextDelta).toHaveBeenCalledTimes(1);
    expect(onTextDelta).toHaveBeenCalledWith('think');
    expect(onTextDeltaCancel).toHaveBeenCalledTimes(1);
    expect(completion.choices[0]?.message.content).toBe('thinkmore');
    expect(completion.choices[0]?.message.tool_calls?.[0]).toMatchObject({
      id: 'call_1',
      function: { name: 'echo', arguments: '{}' },
    });
  });

  it('announces a tool call as soon as id and name are known', async () => {
    const onToolCallStart = vi.fn();

    async function* stream(): AsyncGenerator<ChatCompletionChunk> {
      yield chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'echo', arguments: '' },
          },
        ],
      });
      yield chunk({
        tool_calls: [
          {
            index: 0,
            function: { arguments: '{}' },
          },
        ],
      });
      yield chunk({}, { finish_reason: 'tool_calls' });
    }

    await consumeChatCompletionStream(stream(), { onToolCallStart });

    expect(onToolCallStart).toHaveBeenCalledTimes(1);
    expect(onToolCallStart).toHaveBeenCalledWith('echo', 'call_1');
  });

  it('waits for the full tool name before announcing a streamed call', async () => {
    const onToolCallStart = vi.fn();

    async function* stream(): AsyncGenerator<ChatCompletionChunk> {
      yield chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'e' },
          },
        ],
      });
      yield chunk({
        tool_calls: [
          {
            index: 0,
            function: { name: 'cho' },
          },
        ],
      });
      yield chunk({
        tool_calls: [
          {
            index: 0,
            function: { arguments: '{}' },
          },
        ],
      });
      yield chunk({}, { finish_reason: 'tool_calls' });
    }

    await consumeChatCompletionStream(stream(), { onToolCallStart });

    expect(onToolCallStart).toHaveBeenCalledTimes(1);
    expect(onToolCallStart).toHaveBeenCalledWith('echo', 'call_1');
  });

  it('does not cancel when the stream is content-only', async () => {
    const onTextDelta = vi.fn();
    const onTextDeltaCancel = vi.fn();

    async function* stream(): AsyncGenerator<ChatCompletionChunk> {
      yield chunk({ content: 'Hi' });
      yield chunk({ content: '!' }, { finish_reason: 'stop' });
    }

    await consumeChatCompletionStream(stream(), { onTextDelta, onTextDeltaCancel });

    expect(onTextDelta.mock.calls.map((call) => call[0])).toEqual(['Hi', '!']);
    expect(onTextDeltaCancel).not.toHaveBeenCalled();
  });

  it('forwards reasoning separately from content', async () => {
    const onTextDelta = vi.fn();
    const onReasoningDelta = vi.fn();

    async function* stream(): AsyncGenerator<ChatCompletionChunk> {
      yield chunk({
        reasoning_content: 'hmm',
      } as ChatCompletionChunk['choices'][number]['delta']);
      yield chunk({ content: 'ok' }, { finish_reason: 'stop' });
    }

    await consumeChatCompletionStream(stream(), { onTextDelta, onReasoningDelta });

    expect(onReasoningDelta).toHaveBeenCalledWith('hmm');
    expect(onTextDelta).toHaveBeenCalledWith('ok');
    expect(onTextDelta).not.toHaveBeenCalledWith('hmm');
  });

  it('stops waiting when the abort signal fires', async () => {
    const controller = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onTextDelta = vi.fn();

    async function* stream(): AsyncGenerator<ChatCompletionChunk> {
      yield chunk({ content: 'Hi' });
      await gate;
      yield chunk({ content: 'there' }, { finish_reason: 'stop' });
    }

    const pending = consumeChatCompletionStream(stream(), {
      onTextDelta,
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(onTextDelta).toHaveBeenCalledWith('Hi');
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    release();
  });
});
