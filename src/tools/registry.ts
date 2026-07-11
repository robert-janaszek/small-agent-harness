import { ToolContext, SmartHomeTool } from './types';
import { getDeviceStatus } from './get-device-status';
import { controlAllDevicesInRoom } from './control-all-devices-in-room';
import { listDevices } from './list-devices';
import { controlDevice } from './control-device';

const toolFactories = [
  getDeviceStatus,
  controlAllDevicesInRoom,
  listDevices,
  controlDevice,
];

export function createTools(context: ToolContext): SmartHomeTool[] {
  return toolFactories.map(factory => factory(context));
}
