import { listDevices } from './listDevices.tool';
import { ToolFactory } from '../../types';

type Props = { entity_id: string }

export const getDeviceStatus: ToolFactory<Props> = (context) => ({
  type: 'function',
  function: {
    name: 'get_device_status',
    description: 'Gets the current state of a selected smart home device.',
    parameters: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'Entity identifier, e.g. light.salon, switch.pompa' }
      },
      required: ['entity_id']
    }
  },
  async call(args) {
    if (!Object.keys(context.deviceState).includes(args.entity_id)) {
      const listDevicesTool = listDevices(context);
      const knownDevices = await listDevicesTool.call({});
      return `Error: Device ${args.entity_id} not recognized. Available devices:\n${knownDevices}`;
    }

    return context.deviceState[args.entity_id];
  }
});
