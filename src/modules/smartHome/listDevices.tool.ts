import { defineTool } from '../../core/tool';
import { listDeviceEntries } from './devices';
import { listDevicesArgsSchema } from './schemas';
import type { ToolContext } from './types';

export const listDevices = defineTool({
  name: 'listDevices',
  description:
    'Lists known binary devices and AC units as JSON ({ devices: [{ controlGroup, room, deviceId, value }] }). value is "ON"/"OFF" for binary devices or { power, targetTemperature } for AC. For AC control use getAcStatus, controlAc and setAcTemperature.',
  argsSchema: listDevicesArgsSchema,
  activity: {
    present: 'listing',
    past: 'listed',
    target: (args) => {
      const noun = args.controlGroup ?? 'devices';
      const withState = args.stateFilter ? `${args.stateFilter} ${noun}` : noun;
      return args.room ? `${withState} in ${args.room}` : withState;
    },
  },
  call(context: ToolContext, args) {
    return JSON.stringify({ devices: listDeviceEntries(context, args) });
  },
});
