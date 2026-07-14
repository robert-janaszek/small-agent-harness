import { defineTool } from '../../tools/defineTool';
import { formatAcLabel, setAcPower } from './devices';
import { controlAcArgsSchema } from './schemas';

export const controlAc = defineTool({
  name: 'controlAc',
  description: 'Turns air conditioning on or off for a single unit.',
  argsSchema: controlAcArgsSchema,
  call(context, args) {
    const ref = { room: args.room, deviceId: args.deviceId };
    const power = args.action === 'turn_on' ? 'ON' : 'OFF';
    if (!setAcPower(context, ref, power)) {
      return `AC unit ${formatAcLabel(ref)} does not exist`;
    }

    return `AC unit ${formatAcLabel(ref)} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  },
});
