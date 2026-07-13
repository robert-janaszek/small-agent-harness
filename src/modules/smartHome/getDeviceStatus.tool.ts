import { listDevices } from './listDevices.tool';
import { ToolFactory } from '../../types';
import { AC_CONTROL_GROUP, formatDeviceLabel, getDeviceState } from './devices';
import { getDeviceStatusArgsSchema, type GetDeviceStatusArgs } from './schemas';

export const getDeviceStatus: ToolFactory<GetDeviceStatusArgs> = (context) => ({
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
  argsSchema: getDeviceStatusArgsSchema,
  async call(args) {
    if (args.controlGroup === AC_CONTROL_GROUP) {
      return `Error: Use getAcStatus for AC units instead of getDeviceStatus`;
    }

    const state = getDeviceState(context, args);
    if (state === undefined) {
      const listDevicesTool = listDevices(context);
      const knownDevices = await listDevicesTool.call({});
      return `Error: Device ${formatDeviceLabel(args)} not recognized. Available devices:\n${knownDevices}`;
    }

    return state;
  },
});
