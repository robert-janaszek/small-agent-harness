import { defineTool } from '../../tools/defineTool';
import { listDevices } from './listDevices.tool';
import { formatDeviceLabel, getDeviceState, isAcControlGroup } from './devices';
import { getDeviceStatusArgsSchema } from './schemas';

export const getDeviceStatus = defineTool({
  name: 'getDeviceStatus',
  description: 'Gets the current state of a selected smart home device.',
  argsSchema: getDeviceStatusArgsSchema,
  async call(context, args) {
    if (isAcControlGroup(args.controlGroup, context)) {
      return `Error: Use getAcStatus for AC units instead of getDeviceStatus`;
    }

    const state = getDeviceState(context, args);
    if (state === undefined) {
      const listDevicesTool = listDevices(context);
      const knownDevices = await listDevicesTool.call({});
      return `Error: Device ${formatDeviceLabel(args)} not recognized. Available devices: ${knownDevices}`;
    }

    return state;
  },
});
