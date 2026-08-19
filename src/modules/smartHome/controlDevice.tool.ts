import { defineTool, toolFailure } from '../../core/tool';
import { formatDeviceLabel, isAcControlGroup, setDeviceState } from './devices';
import { controlDeviceArgsSchema } from './schemas';
import type { ToolContext } from './types';

export const controlDevice = defineTool({
  name: 'controlDevice',
  description:
    'Controls a single binary device (lights, TV, water valves). To change multiple devices in a room, call this tool once per deviceId.',
  argsSchema: controlDeviceArgsSchema,
  activity: {
    present: (args) => (args.action === 'turn_off' ? 'turning off' : 'turning on'),
    past: (args) => (args.action === 'turn_off' ? 'turned off' : 'turned on'),
    target: (args) => `${args.controlGroup} ${args.deviceId} in ${args.room}`,
  },
  call(context: ToolContext, args) {
    if (isAcControlGroup(args.controlGroup, context)) {
      return toolFailure('Error: Use controlAc for AC units instead of controlDevice');
    }

    const nextState = args.action === 'turn_on' ? 'ON' : 'OFF';
    if (!setDeviceState(context, args, nextState)) {
      return toolFailure(`Device ${formatDeviceLabel(args)} does not exist`);
    }

    return `Device ${formatDeviceLabel(args)} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  },
});
