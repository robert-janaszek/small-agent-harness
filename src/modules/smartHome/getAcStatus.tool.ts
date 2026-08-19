import { defineTool, toolFailure } from '../../tools/defineTool';
import { formatAcLabel, getAcState } from './devices';
import { getAcStatusArgsSchema } from './schemas';

export const getAcStatus = defineTool({
  name: 'getAcStatus',
  description: 'Gets power state and target temperature for a single AC unit.',
  argsSchema: getAcStatusArgsSchema,
  activity: {
    present: 'getting AC status of',
    past: 'got AC status of',
    target: (args) => `AC ${args.deviceId} in ${args.room}`,
  },
  call(context, args) {
    const ref = { room: args.room, deviceId: args.deviceId };
    const ac = getAcState(context, ref);
    if (!ac) {
      return toolFailure(`AC unit ${formatAcLabel(ref)} does not exist`);
    }

    return `power: ${ac.power}, targetTemperature: ${ac.targetTemperature}°C`;
  },
});
