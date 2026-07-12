import { ToolFactory } from '../../types';
import { formatDeviceLabel, listDeviceEntries } from './devices';

type Props = { stateFilter?: 'ON' | 'OFF' };

export const listDevices: ToolFactory<Props> = (context) => ({
  type: 'function',
  function: {
    name: 'listDevices',
    description: 'Lists all known devices, optionally filtered by state (ON/OFF).',
    parameters: {
      type: 'object',
      properties: {
        stateFilter: { type: 'string', enum: ['ON', 'OFF'], description: 'Optional filter by device state' },
      },
    },
  },
  async call(args) {
    return listDeviceEntries(context, args.stateFilter)
      .map((entry) => `${formatDeviceLabel(entry)}: ${entry.state}`)
      .join('\n');
  },
});
