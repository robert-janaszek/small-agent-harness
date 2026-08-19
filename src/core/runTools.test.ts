import { describe, it, expect } from 'vitest';
import OpenAI from 'openai';
import { z } from 'zod';

import { runTools, toAssistantHistoryMessage } from './runTools';
import { createTool, toolFailure } from './tool';
import { delay } from './delay';

function makeToolCallMessage(
  toolName: string,
  args: string,
  id = 'call_1',
): OpenAI.Chat.Completions.ChatCompletionMessage {
  return {
    role: 'assistant',
    content: null,
    refusal: null,
    tool_calls: [
      {
        id,
        type: 'function',
        function: {
          name: toolName,
          arguments: args,
        },
      },
    ],
  };
}

describe('runTools', () => {
  const echoTool = createTool({
    name: 'echo',
    description: 'echo',
    argsSchema: z.object({ text: z.string().min(1) }),
    activity: { present: 'echoing', past: 'echoed' },
    call: async (args) => `echo:${args.text}`,
  });

  it('returns an error for malformed JSON arguments', async () => {
    const response = await runTools(makeToolCallMessage('echo', '{not-json'), [echoTool]);

    expect(response).toHaveLength(1);
    expect(response[0].content).toBe('Invalid tool arguments: malformed JSON');
  });

  it('returns an error for invalid tool arguments', async () => {
    const response = await runTools(
      makeToolCallMessage('echo', JSON.stringify({ text: '' })),
      [echoTool],
    );

    expect(response).toHaveLength(1);
    expect(response[0].content).toContain('Invalid tool arguments:');
  });

  it('calls the tool when arguments are valid', async () => {
    const response = await runTools(
      makeToolCallMessage('echo', JSON.stringify({ text: 'hi' })),
      [echoTool],
    );

    expect(response).toHaveLength(1);
    expect(response[0].content).toBe('echo:hi');
  });

  it('returns an error for unknown tools', async () => {
    const response = await runTools(
      makeToolCallMessage('missing', JSON.stringify({ text: 'hi' })),
      [echoTool],
    );

    expect(response).toHaveLength(1);
    expect(response[0].content).toContain('Unknown tool: missing');
  });

  it('returns tool execution errors', async () => {
    const failingTool = createTool({
      name: 'fail',
      description: 'fail',
      argsSchema: z.object({ text: z.string() }),
      activity: { present: 'failing', past: 'failed' },
      call: async () => {
        throw new Error('tool failed');
      },
    });

    const response = await runTools(
      makeToolCallMessage('fail', JSON.stringify({ text: 'hi' })),
      [failingTool],
    );

    expect(response[0].content).toBe(JSON.stringify({ error: 'tool failed' }));
  });

  it('handles non-Error throws from tools', async () => {
    const failingTool = createTool({
      name: 'fail',
      description: 'fail',
      argsSchema: z.object({ text: z.string() }),
      activity: { present: 'failing', past: 'failed' },
      call: async () => {
        throw 'boom';
      },
    });

    const response = await runTools(
      makeToolCallMessage('fail', JSON.stringify({ text: 'hi' })),
      [failingTool],
    );

    expect(response[0].content).toBe(JSON.stringify({ error: 'Unknown error' }));
  });

  it('returns feedback for custom tool calls', async () => {
    const response = await runTools(
      {
        role: 'assistant',
        content: null,
        refusal: null,
        tool_calls: [
          {
            id: 'call_custom',
            type: 'custom',
            custom: { name: 'myTool', input: 'do something' },
          },
        ],
      },
      [echoTool],
    );

    expect(response).toHaveLength(1);
    expect(response[0]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_custom',
      content: 'Custom tool "myTool" is not supported. Use the provided function tools.',
    });
  });

  it('preserves assistant text alongside tool calls in history messages', () => {
    expect(
      toAssistantHistoryMessage({
        role: 'assistant',
        content: 'Checking first.',
        refusal: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'echo', arguments: '{}' },
          },
        ],
      }),
    ).toEqual({
      role: 'assistant',
      content: 'Checking first.',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'echo', arguments: '{}' },
        },
      ],
    });
  });

  it('invokes hooks for assistant message, tool call, and tool result', async () => {
    const events: string[] = [];
    const tool = createTool({
      name: 'echo',
      description: 'echo',
      argsSchema: z.object({ text: z.string() }),
      activity: { present: 'echoing', past: 'echoed' },
      call: async ({ text }) => `echo:${text}`,
    });

    await runTools(
      {
        role: 'assistant',
        content: 'Let me check.',
        refusal: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'echo', arguments: '{"text":"hi"}' },
          },
        ],
      },
      [tool],
      {
        onAssistantMessage: (content) => events.push(`assistant:${content}`),
        onToolCall: (name, args) => events.push(`call:${name}:${JSON.stringify(args)}`),
        onToolResult: (name, content) => events.push(`result:${name}:${content}`),
      },
    );

    expect(events).toEqual([
      'assistant:Let me check.',
      'call:echo:{"text":"hi"}',
      'result:echo:echo:hi',
    ]);
  });

  it('reports ToolFailure results as failed without changing LLM content', async () => {
    const flags: Array<boolean | undefined> = [];
    const tool = createTool({
      name: 'replace',
      description: 'replace',
      argsSchema: z.object({ old_string: z.string() }),
      activity: { present: 'replacing', past: 'replaced' },
      call: () => toolFailure('No exact match for old_string was found in the file.'),
    });

    const response = await runTools(
      makeToolCallMessage('replace', JSON.stringify({ old_string: 'foo' })),
      [tool],
      {
        onToolResult: (_name, _content, _id, failed) => flags.push(failed),
      },
    );

    expect(response[0].content).toBe('No exact match for old_string was found in the file.');
    expect(flags).toEqual([true]);
  });

  it('rethrows abort errors from in-flight tools', async () => {
    const controller = new AbortController();
    const tool = createTool({
      name: 'slow',
      description: 'slow',
      argsSchema: z.object({}),
      activity: { present: 'waiting', past: 'waited' },
      call: async (_args, options) => {
        await delay(5_000, options?.signal);
        return 'done';
      },
    });

    const pending = runTools(makeToolCallMessage('slow', '{}'), [tool], {
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
