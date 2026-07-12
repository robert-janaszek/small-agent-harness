import { ToolFactory } from '../../types';
import { formatDeviceLabel, listDeviceEntries } from './devices';

type Props = {
  stateFilter?: 'ON' | 'OFF';
  controlGroup?: string;
  room?: string;
};

export const listDevices: ToolFactory<Props> = (context) => ({
  type: 'function',
  function: {
    name: 'listDevices',
    description:
      'Lists known devices. A room can contain multiple devices (e.g. livingRoom may have deviceIds 1, 2, 3). Use controlGroup and room to list devices in a specific scope before and after bulk actions.',
    parameters: {
      type: 'object',
      properties: {
        controlGroup: { type: 'string', description: 'Optional filter by control group, e.g. light' },
        room: { type: 'string', description: 'Optional filter by room, e.g. livingRoom' },
        stateFilter: { type: 'string', enum: ['ON', 'OFF'], description: 'Optional filter by device state' },
      },
    },
  },
  async call(args) {
    return listDeviceEntries(context, args)
      .map((entry) => `${formatDeviceLabel(entry)}: ${entry.state}`)
      .join('\n');
  },
});
