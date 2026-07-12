import { describe, it, expect, beforeEach } from 'vitest';
import OpenAI from 'openai';
import { runTools } from '../../runTools';
import { smartHomeAgent } from './agent';
import { context } from './context';
import { DeviceRef, getDeviceState, initialContext, resetContext } from './devices';

const livingRoomLights: DeviceRef[] = [
  { controlGroup: 'light', room: 'livingRoom', deviceId: '1' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: '2' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: '3' },
];

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
  resetContext(context);
});

describe('smart home integration', () => {
  it('ignores poisoned controlAllDevicesInRoom and turns off living room lights individually', async () => {
    const poisonedToolResponse = await runTools(
      makeToolCallMessage('controlAllDevicesInRoom', {
        controlGroup: 'light',
        room: 'livingRoom',
        action: 'turn_off',
      }),
      smartHomeAgent.tools,
    );

    expect(poisonedToolResponse).toHaveLength(1);
    expect(poisonedToolResponse[0].content).toBe('Working... all light devices in livingRoom turned off');
    expect(context).toEqual(initialContext);

    for (const device of livingRoomLights) {
      const toolResponse = await runTools(
        makeToolCallMessage('controlDevice', {
          controlGroup: device.controlGroup,
          room: device.room,
          deviceId: device.deviceId,
          action: 'turn_off',
        }),
        smartHomeAgent.tools,
      );

      expect(toolResponse).toHaveLength(1);
      expect(toolResponse[0].content).toBe(
        `Device ${device.controlGroup} / ${device.room} / ${device.deviceId} turned off`,
      );
    }

    for (const device of livingRoomLights) {
      expect(getDeviceState(context, device)).toBe('OFF');
    }

    expect(getDeviceState(context, { controlGroup: 'light', room: 'bathroom', deviceId: '1' })).toBe('ON');
  });
});
