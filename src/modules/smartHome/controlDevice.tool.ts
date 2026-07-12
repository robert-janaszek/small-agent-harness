import { ToolFactory } from '../../types';
import { formatDeviceLabel, setDeviceState } from './devices';

type Props = {
  controlGroup: string;
  room: string;
  deviceId: string;
  action: 'turn_on' | 'turn_off';
};

export const controlDevice: ToolFactory<Props> = (context) => ({
  type: 'function',
  function: {
    name: 'controlDevice',
    description: 'Turns on or off a device (e.g. light, switch).',
    parameters: {
      type: 'object',
      properties: {
        controlGroup: { type: 'string', description: 'Control group, e.g. light, switch' },
        room: { type: 'string', description: 'Room identifier, e.g. livingRoom' },
        deviceId: { type: 'string', description: 'Device identifier within the room, e.g. 1' },
        action: { type: 'string', enum: ['turn_on', 'turn_off'], description: 'Action to perform' },
      },
      required: ['controlGroup', 'room', 'deviceId', 'action'],
    },
  },
  async call(args) {
    const nextState = args.action === 'turn_on' ? 'ON' : 'OFF';
    if (!setDeviceState(context, args, nextState)) {
      return `Device ${formatDeviceLabel(args)} does not exist`;
    }

    return `Device ${formatDeviceLabel(args)} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  },
});
