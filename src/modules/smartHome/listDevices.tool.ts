import { defineTool } from '../../tools/defineTool';
import { listDeviceEntries } from './devices';
import { listDevicesArgsSchema } from './schemas';

export const listDevices = defineTool({
  name: 'listDevices',
  description:
    'Lists known binary devices and AC units as JSON ({ devices: [{ controlGroup, room, deviceId, value }] }). value is "ON"/"OFF" for binary devices or { power, targetTemperature } for AC. For AC control use getAcStatus, controlAc and setAcTemperature.',
  argsSchema: listDevicesArgsSchema,
  call(context, args) {
    return JSON.stringify({ devices: listDeviceEntries(context, args) });
  },
});
