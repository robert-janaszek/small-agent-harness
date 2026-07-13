import { defineTool } from '../../defineTool';
import { formatDeviceLabel, listDeviceEntries } from './devices';
import { listDevicesArgsSchema } from './schemas';

export const listDevices = defineTool({
  name: 'listDevices',
  description:
    'Lists known binary devices and AC units. A room can contain multiple devices. For AC temperature and power, use getAcStatus, controlAc and setAcTemperature.',
  argsSchema: listDevicesArgsSchema,
  call(context, args) {
    return listDeviceEntries(context, args)
      .map((entry) => `${formatDeviceLabel(entry)}: ${entry.state}`)
      .join('\n');
  },
});
