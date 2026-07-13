import { ToolFactory } from '../../types';
import { formatDeviceLabel, listDeviceEntries } from './devices';
import { listDevicesArgsSchema, type ListDevicesArgs } from './schemas';

export const listDevices: ToolFactory<ListDevicesArgs> = (context) => ({
  type: 'function',
  function: {
    name: 'listDevices',
    description:
      'Lists known binary devices and AC units. A room can contain multiple devices. For AC temperature and power, use getAcStatus, controlAc and setAcTemperature.',
    parameters: {
      type: 'object',
      properties: {
        controlGroup: { type: 'string', description: 'Optional filter by control group, e.g. light' },
        room: { type: 'string', description: 'Optional filter by room, e.g. livingRoom' },
        stateFilter: { type: 'string', enum: ['ON', 'OFF'], description: 'Optional filter by device state' },
      },
    },
  },
  argsSchema: listDevicesArgsSchema,
  async call(args) {
    return listDeviceEntries(context, args)
      .map((entry) => `${formatDeviceLabel(entry)}: ${entry.state}`)
      .join('\n');
  },
});
