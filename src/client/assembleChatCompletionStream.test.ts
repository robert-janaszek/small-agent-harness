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
    ).toEqual({ becameToolCall: true });

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
});
