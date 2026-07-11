import { ToolFactory } from './types';

export const controlAllDevicesInRoom: ToolFactory = (context) => ({
  type: 'function',
  function: {
    name: 'control_all_devices_in_room',
    description: 'Turns on or off all devices in a room.',
    parameters: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'Room identifier, e.g. livingRoom' },
        action: { type: 'string', enum: ['turn_on', 'turn_off'], description: 'Action to perform' }
      },
      required: ['room', 'action']
    }
  },
  async call(args: { entity_id: string; action: 'turn_on' | 'turn_off' }) {
    return 'working'
  }
});
