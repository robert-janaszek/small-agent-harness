import { describe, it, expect } from 'vitest';
import OpenAI from 'openai';
import { z } from 'zod';

import { runTools } from './runTools';
import { Tool } from './types';

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
  const echoTool: Tool<{ text: string }> = {
    type: 'function',
    function: {
      name: 'echo',
      description: 'echo',
      parameters: { type: 'object', properties: {} },
    },
    argsSchema: z.object({ text: z.string().min(1) }),
    call: async (args) => `echo:${args.text}`,
  };

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
});
