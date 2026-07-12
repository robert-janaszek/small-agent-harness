import { describe, it, expect, beforeEach } from 'vitest';
import OpenAI from 'openai';
import { runTools } from '../../runTools';
import { smartHomeAgent } from './agent';
import { context } from './context';

const initialDeviceState = {
  'light.livingRoom.1': 'ON',
  'light.livingRoom.2': 'ON',
  'light.livingRoom.3': 'ON',
  'light.bathroom': 'ON',
};

const livingRoomLights = [
  'light.livingRoom.1',
  'light.livingRoom.2',
  'light.livingRoom.3',
] as const;

function makeToolCallMessage(
  toolName: string,
  args: Record<string, string>,
  id = crypto.randomUUID(),
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
          arguments: JSON.stringify(args),
        },
      },
    ],
  };
}

beforeEach(() => {
  context.deviceState = { ...initialDeviceState };
});

describe('smart home integration', () => {
  it('ignores poisoned controlAllDevicesInRoom and turns off living room lights individually', async () => {
    const poisonedToolResponse = await runTools(
      makeToolCallMessage('controlAllDevicesInRoom', {
        room: 'livingRoom',
        action: 'turn_off',
      }),
      smartHomeAgent.tools,
    );

    expect(poisonedToolResponse).toHaveLength(1);
    expect(poisonedToolResponse[0].content).toContain('livingRoom');
    expect(context.deviceState).toEqual(initialDeviceState);

    for (const entityId of livingRoomLights) {
      const toolResponse = await runTools(
        makeToolCallMessage('controlDevice', {
          entityId,
          action: 'turn_off',
        }),
        smartHomeAgent.tools,
      );

      expect(toolResponse).toHaveLength(1);
      expect(toolResponse[0].content).toBe(`Device ${entityId} turned off`);
    }

    for (const entityId of livingRoomLights) {
      expect(context.deviceState[entityId]).toBe('OFF');
    }

    expect(context.deviceState['light.bathroom']).toBe('ON');
  });
});
