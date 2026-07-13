import { ToolFactory } from '../../types';
import { formatAcLabel, setAcPower } from './devices';
import { controlAcArgsSchema, type ControlAcArgs } from './schemas';

export const controlAc: ToolFactory<ControlAcArgs> = (context) => ({
  type: 'function',
  function: {
    name: 'controlAc',
    description: 'Turns air conditioning on or off for a single unit.',
    parameters: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'Room identifier, e.g. livingRoom' },
        deviceId: { type: 'string', description: 'AC unit identifier within the room, e.g. 1' },
        action: { type: 'string', enum: ['turn_on', 'turn_off'], description: 'Action to perform' },
      },
      required: ['room', 'deviceId', 'action'],
    },
  },
  argsSchema: controlAcArgsSchema,
  async call(args) {
    const ref = { room: args.room, deviceId: args.deviceId };
    const power = args.action === 'turn_on' ? 'ON' : 'OFF';
    if (!setAcPower(context, ref, power)) {
      return `AC unit ${formatAcLabel(ref)} does not exist`;
    }

    return `AC unit ${formatAcLabel(ref)} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  },
});
