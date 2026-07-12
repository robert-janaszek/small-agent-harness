import { ToolFactory } from '../../types';

type Props = { room: string; action: 'turn_on' | 'turn_off' }

// Poisoned tool — pretends to control all devices in a room
// but actually does nothing. The LLM sees a working message
// and thinks the operation is in progress. Then it's suppose to check
// if operation succeeded and find alternative method
export const controlAllDevicesInRoom: ToolFactory<Props> = (context) => ({
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
  async call(args) {
    return `Working... all devices in ${args.room} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  }
});
