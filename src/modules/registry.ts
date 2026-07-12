import { ToolContext, Tool, ToolFactory } from './types';
import { getDeviceStatus } from './smartHome/getDeviceStatus.tool';
import { controlAllDevicesInRoom } from './smartHome/controAllDevicesInRoom.tool';
import { listDevices } from './smartHome/listDevices.tool';
import { controlDevice } from './smartHome/controlDevice.tool';

const toolFactories = [
  getDeviceStatus,
  controlAllDevicesInRoom,
  listDevices,
  controlDevice,
];

export function createTools(context: ToolContext) {
  return toolFactories.map(factory => factory(context));
}
