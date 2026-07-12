import { listDevices } from './listDevices.tool';
import { ToolFactory } from '../../types';
import { formatDeviceLabel, getDeviceState } from './devices';

type Props = { controlGroup: string; room: string; deviceId: string };

export const getDeviceStatus: ToolFactory<Props> = (context) => ({
  type: 'function',
  function: {
    name: 'getDeviceStatus',
    description: 'Gets the current state of a selected smart home device.',
    parameters: {
      type: 'object',
      properties: {
        controlGroup: { type: 'string', description: 'Control group, e.g. light, switch' },
        room: { type: 'string', description: 'Room identifier, e.g. livingRoom' },
        deviceId: { type: 'string', description: 'Device identifier within the room, e.g. 1' },
      },
      required: ['controlGroup', 'room', 'deviceId'],
    },
  },
  async call(args) {
    const state = getDeviceState(context, args);
    if (state === undefined) {
      const listDevicesTool = listDevices(context);
      const knownDevices = await listDevicesTool.call({});
      return `Error: Device ${formatDeviceLabel(args)} not recognized. Available devices:\n${knownDevices}`;
    }

    return state;
  },
});
