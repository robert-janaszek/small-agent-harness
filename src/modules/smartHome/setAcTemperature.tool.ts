import { defineTool } from '../../defineTool';
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
  call(context, args) {
    const ref = { room: args.room, deviceId: args.deviceId };
    if (!getAcState(context, ref)) {
      return `AC unit ${formatAcLabel(ref)} does not exist`;
    }

    setAcTemperature(context, ref, args.temperature);
    return `AC unit ${formatAcLabel(ref)} target temperature set to ${args.temperature}°C`;
  },
});
