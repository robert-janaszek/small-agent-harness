import { defineTool, toolFailure } from '../../tools/defineTool';
import { formatAcLabel, setAcPower } from './devices';
import { controlAcArgsSchema } from './schemas';

export const controlAc = defineTool({
  name: 'controlAc',
  description: 'Turns air conditioning on or off for a single unit.',
  argsSchema: controlAcArgsSchema,
  activity: {
    present: (args) => (args.action === 'turn_off' ? 'turning off' : 'turning on'),
    past: (args) => (args.action === 'turn_off' ? 'turned off' : 'turned on'),
    target: (args) => `AC ${args.deviceId} in ${args.room}`,
  },
  call(context, args) {
    const ref = { room: args.room, deviceId: args.deviceId };
    const power = args.action === 'turn_on' ? 'ON' : 'OFF';
    if (!setAcPower(context, ref, power)) {
      return toolFailure(`AC unit ${formatAcLabel(ref)} does not exist`);
    }

    return `AC unit ${formatAcLabel(ref)} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  },
});
