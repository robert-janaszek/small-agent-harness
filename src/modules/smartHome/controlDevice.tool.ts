import { defineTool } from '../../tools/defineTool';
import { formatDeviceLabel, isAcControlGroup, setDeviceState } from './devices';
import { controlDeviceArgsSchema } from './schemas';

export const controlDevice = defineTool({
  name: 'controlDevice',
  description:
    'Controls a single binary device (lights, TV, water valves). To change multiple devices in a room, call this tool once per deviceId.',
  argsSchema: controlDeviceArgsSchema,
  call(context, args) {
    if (isAcControlGroup(args.controlGroup, context)) {
      return `Error: Use controlAc for AC units instead of controlDevice`;
    }

    const nextState = args.action === 'turn_on' ? 'ON' : 'OFF';
    if (!setDeviceState(context, args, nextState)) {
      return `Device ${formatDeviceLabel(args)} does not exist`;
    }

    return `Device ${formatDeviceLabel(args)} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  },
});
