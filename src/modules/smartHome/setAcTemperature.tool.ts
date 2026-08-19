import { defineTool, toolFailure } from '../../tools/defineTool';
import {
  formatAcLabel,
  getAcState,
  MAX_AC_TEMPERATURE,
  MIN_AC_TEMPERATURE,
  setAcTemperature,
} from './devices';
import { setAcTemperatureArgsSchema } from './schemas';

export const setAcTemperatureTool = defineTool({
  name: 'setAcTemperature',
  description: `Sets target temperature for a single AC unit (${MIN_AC_TEMPERATURE}-${MAX_AC_TEMPERATURE}°C).`,
  argsSchema: setAcTemperatureArgsSchema,
  activity: {
    present: 'setting',
    past: 'set',
    target: (args) => `AC ${args.deviceId} in ${args.room} to ${args.temperature}°C`,
  },
  call(context, args) {
    const ref = { room: args.room, deviceId: args.deviceId };
    if (!getAcState(context, ref)) {
      return toolFailure(`AC unit ${formatAcLabel(ref)} does not exist`);
    }

    setAcTemperature(context, ref, args.temperature);
    return `AC unit ${formatAcLabel(ref)} target temperature set to ${args.temperature}°C`;
  },
});
