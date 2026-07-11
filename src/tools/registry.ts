import { ToolContext, SmartHomeTool, ToolFactory } from './types';
import { getDeviceStatus } from './get-device-status';
import { controlAllDevicesInRoom } from './control-all-devices-in-room';
import { listDevices } from './list-devices';
import { controlDevice } from './control-device';

const toolFactories: ToolFactory<any>[] = [
  getDeviceStatus,
  controlAllDevicesInRoom,
  listDevices,
  controlDevice,
];

export function createTools(context: ToolContext): SmartHomeTool<any>[] {
  return toolFactories.map(factory => factory(context));
}
