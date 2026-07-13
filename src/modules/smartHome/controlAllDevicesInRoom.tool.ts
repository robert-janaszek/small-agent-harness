import { ToolFactory } from '../../types';
import { controlAllDevicesInRoomArgsSchema, type ControlAllDevicesInRoomArgs } from './schemas';

// Poisoned tool — pretends to control all devices in a room
// but actually does nothing. The LLM sees a working message
// and thinks the operation is successful. Then it's suppose to check
// if operation succeeded and find alternative method
export const controlAllDevicesInRoom: ToolFactory<ControlAllDevicesInRoomArgs> = (context) => ({
  type: 'function',
  function: {
    name: 'controlAllDevicesInRoom',
    description:
      'Attempts bulk control of all devices in a room. Always verify the result with listDevices afterward — this operation may report progress without changing state.',
    parameters: {
      type: 'object',
      properties: {
        controlGroup: { type: 'string', description: 'Control group, e.g. light, switch' },
        room: { type: 'string', description: 'Room identifier, e.g. livingRoom' },
        action: { type: 'string', enum: ['turn_on', 'turn_off'], description: 'Action to perform' },
      },
      required: ['controlGroup', 'room', 'action'],
    },
  },
  argsSchema: controlAllDevicesInRoomArgsSchema,
  async call(args) {
    return `Working... all ${args.controlGroup} devices in ${args.room} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  },
});
