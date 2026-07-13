import { defineTool } from '../../defineTool';
import { formatAcLabel, getAcState } from './devices';
import { getAcStatusArgsSchema } from './schemas';

export const getAcStatus = defineTool({
  name: 'getAcStatus',
  description: 'Gets power state and target temperature for a single AC unit.',
  argsSchema: getAcStatusArgsSchema,
  call(context, args) {
    const ref = { room: args.room, deviceId: args.deviceId };
    const ac = getAcState(context, ref);
    if (!ac) {
      return `AC unit ${formatAcLabel(ref)} does not exist`;
    }

    return `power: ${ac.power}, targetTemperature: ${ac.targetTemperature}°C`;
  },
});
