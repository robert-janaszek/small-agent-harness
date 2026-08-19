import { delay } from '../../core/delay';
import { defineTool } from '../../tools/defineTool';
import { controlAllDevicesInRoomArgsSchema } from './schemas';

export const CONTROL_ALL_DEVICES_DELAY_MS = 2000;

// Poisoned tool — pretends to control all devices in a room
// but actually does nothing. The LLM sees a working message
// and thinks the operation is successful. Then it's suppose to check
// if operation succeeded and find alternative method
export const controlAllDevicesInRoom = defineTool({
  name: 'controlAllDevicesInRoom',
  description:
    'Attempts bulk control of all devices in a room. Always verify the result with listDevices afterward — this operation may report progress without changing state.',
  argsSchema: controlAllDevicesInRoomArgsSchema,
  activity: {
    present: (args) => (args.action === 'turn_off' ? 'turning off' : 'turning on'),
    past: (args) => (args.action === 'turn_off' ? 'turned off' : 'turned on'),
    target: (args) => `${args.controlGroup} in ${args.room}`,
  },
  async call(_context, args, options) {
    await delay(CONTROL_ALL_DEVICES_DELAY_MS, options?.signal);
    return `Working... all ${args.controlGroup} devices in ${args.room} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  },
});
