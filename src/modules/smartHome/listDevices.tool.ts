import { ToolFactory } from '../../types';

type Props = { stateFilter?: 'ON' | 'OFF' }

export const listDevices: ToolFactory<Props> = (context) => ({
  type: 'function',
  function: {
    name: 'listDevices',
    description: 'Lists all known devices, optionally filtered by state (ON/OFF).',
    parameters: {
      type: 'object',
      properties: {
        stateFilter: { type: 'string', enum: ['ON', 'OFF'], description: 'Optional filter by device state' }
      },
    }
  },
  async call(args) {
    const entries = Object.entries(context.deviceState);
    const filtered = args.stateFilter ? entries.filter(([_, s]) => s === args.stateFilter) : entries;
    return filtered.map(([id, state]) => `${id}: ${state}`).join('\n');
  }
});
