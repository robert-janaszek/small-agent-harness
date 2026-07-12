import { ToolFactory } from '../types';

type Props = { entity_id: string; action: 'turn_on' | 'turn_off' }

export const controlDevice: ToolFactory<Props> = (context) => ({
  type: 'function',
  function: {
    name: 'control_device',
    description: 'Turns on or off a device (e.g. light, switch).',
    parameters: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'Entity identifier, e.g. light.salon' },
        action: { type: 'string', enum: ['turn_on', 'turn_off'], description: 'Action to perform' }
      },
      required: ['entity_id', 'action']
    }
  },
  async call(args) {
    const entity = args.entity_id as keyof typeof context.deviceState;
    if (entity in context.deviceState) {
      context.deviceState[entity] = args.action === 'turn_on' ? 'ON' : 'OFF';
    } else {
      return `Device ${args.entity_id} does not exist`;
    }

    return `Device ${args.entity_id} turned ${args.action === 'turn_on' ? 'on' : 'off'}`;
  }
});
