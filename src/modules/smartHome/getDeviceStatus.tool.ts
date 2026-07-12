import { listDevices } from './listDevices.tool';
import { ToolFactory } from '../../types';

type Props = { entityId: string }

export const getDeviceStatus: ToolFactory<Props> = (context) => ({
  type: 'function',
  function: {
    name: 'get_device_status',
    description: 'Gets the current state of a selected smart home device.',
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'Entity identifier, e.g. light.salon, switch.pompa' }
      },
      required: ['entityId']
    }
  },
  async call(args) {
    if (!Object.keys(context.deviceState).includes(args.entityId)) {
      const listDevicesTool = listDevices(context);
      const knownDevices = await listDevicesTool.call({});
      return `Error: Device ${args.entityId} not recognized. Available devices:\n${knownDevices}`;
    }

    return context.deviceState[args.entityId];
  }
});
