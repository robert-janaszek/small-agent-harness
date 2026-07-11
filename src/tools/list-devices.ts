import { ToolFactory } from './types';

export const listDevices: ToolFactory = (context) => ({
  type: 'function',
  function: {
    name: 'list_devices',
    description: 'Lists all known devices, optionally filtered by state (ON/OFF).',
    parameters: {
      type: 'object',
      properties: {
        state_filter: { type: 'string', enum: ['ON', 'OFF'], description: 'Optional filter by device state' }
      },
    }
  },
  async call(args: { state_filter?: 'ON' | 'OFF' }) {
    const entries = Object.entries(context.deviceState);
    const filtered = args.state_filter ? entries.filter(([_, s]) => s === args.state_filter) : entries;
    return filtered.map(([id, state]) => `${id}: ${state}`).join('\n');
  }
});
