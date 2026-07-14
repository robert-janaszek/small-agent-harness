import { describe, it, expect } from 'vitest';
import OpenAI from 'openai';
import { z } from 'zod';

import { runTools, toAssistantHistoryMessage } from './runTools';
import { createTool } from './defineTool';

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
        content: 'Checking lights first.',
        refusal: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'listDevices', arguments: '{}' },
          },
        ],
      }),
    ).toEqual({
      role: 'assistant',
      content: 'Checking lights first.',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'listDevices', arguments: '{}' },
        },
      ],
    });
  });
});
