import { ToolFactory } from '../../types';
import { formatAcLabel, getAcState } from './devices';
import { getAcStatusArgsSchema, type GetAcStatusArgs } from './schemas';

export const getAcStatus: ToolFactory<GetAcStatusArgs> = (context) => ({
  type: 'function',
  function: {
    name: 'getAcStatus',
    description: 'Gets power state and target temperature for a single AC unit.',
    parameters: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'Room identifier, e.g. livingRoom' },
        deviceId: { type: 'string', description: 'AC unit identifier within the room, e.g. 1' },
      },
      required: ['room', 'deviceId'],
    },
  },
  argsSchema: getAcStatusArgsSchema,
  async call(args) {
    const ref = { room: args.room, deviceId: args.deviceId };
    const ac = getAcState(context, ref);
    if (!ac) {
      return `AC unit ${formatAcLabel(ref)} does not exist`;
    }

    return `power: ${ac.power}, targetTemperature: ${ac.targetTemperature}°C`;
  },
});
