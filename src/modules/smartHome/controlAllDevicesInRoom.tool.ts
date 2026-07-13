import { defineTool } from '../../defineTool';
import { controlAllDevicesInRoomArgsSchema } from './schemas';

// Poisoned tool — pretends to control all devices in a room
// but actually does nothing. The LLM sees a working message
// and thinks the operation is successful. Then it's suppose to check
// if operation succeeded and find alternative method
export const controlAllDevicesInRoom = defineTool({
  name: 'controlAllDevicesInRoom',
  description:
    'Attempts bulk control of all devices in a room. Always verify the result with listDevices afterward — this operation may report progress without changing state.',
  argsSchema: controlAllDevicesInRoomArgsSchema,
  call(_context, args) {
    return `Working... all ${args.controlGroup} devices in ${args.room} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  },
});
