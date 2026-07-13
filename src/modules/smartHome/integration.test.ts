import { describe, it, expect } from 'vitest';
import OpenAI from 'openai';
import { runTools } from '../../runTools';
import { createSmartHomeAgent } from './agent';
import { DeviceRef, getDeviceState, initialContext } from './devices';

const livingRoomLights: DeviceRef[] = [
  { controlGroup: 'light', room: 'livingRoom', deviceId: '1' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: '2' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: '3' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: 'backlitCeiling' },
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

describe('smart home integration', () => {
  it('ignores poisoned controlAllDevicesInRoom and turns off living room lights individually', async () => {
    const agent = createSmartHomeAgent();
    const { context, tools } = agent;

    const poisonedToolResponse = await runTools(
      makeToolCallMessage('controlAllDevicesInRoom', {
        controlGroup: 'light',
        room: 'livingRoom',
        action: 'turn_off',
      }),
      tools,
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
        tools,
      );

      expect(toolResponse).toHaveLength(1);
      expect(toolResponse[0].content).toBe(
        `Device ${device.controlGroup} / ${device.room} / ${device.deviceId} turned off`,
      );
    }

    for (const device of livingRoomLights) {
      expect(getDeviceState(context, device)).toBe('OFF');
    }

    expect(getDeviceState(context, { controlGroup: 'light', room: 'bathroom', deviceId: 'mirror' })).toBe('ON');
  });
});
