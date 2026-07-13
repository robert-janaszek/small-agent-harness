import { ToolFactory } from '../../types';
import {
  formatAcLabel,
  getAcState,
  MAX_AC_TEMPERATURE,
  MIN_AC_TEMPERATURE,
  setAcTemperature,
} from './devices';
import { setAcTemperatureArgsSchema, type SetAcTemperatureArgs } from './schemas';

export const setAcTemperatureTool: ToolFactory<SetAcTemperatureArgs> = (context) => ({
  type: 'function',
  function: {
    name: 'setAcTemperature',
    description: `Sets target temperature for a single AC unit (${MIN_AC_TEMPERATURE}-${MAX_AC_TEMPERATURE}°C).`,
    parameters: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'Room identifier, e.g. livingRoom' },
        deviceId: { type: 'string', description: 'AC unit identifier within the room, e.g. 1' },
        temperature: {
          type: 'number',
          description: `Target temperature in °C (${MIN_AC_TEMPERATURE}-${MAX_AC_TEMPERATURE})`,
        },
      },
      required: ['room', 'deviceId', 'temperature'],
    },
  },
  argsSchema: setAcTemperatureArgsSchema,
  async call(args) {
    const ref = { room: args.room, deviceId: args.deviceId };
    if (!getAcState(context, ref)) {
      return `AC unit ${formatAcLabel(ref)} does not exist`;
    }

    setAcTemperature(context, ref, args.temperature);
    return `AC unit ${formatAcLabel(ref)} target temperature set to ${args.temperature}°C`;
  },
});
