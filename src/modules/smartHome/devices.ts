import { ToolContext } from '../../types';

export type DeviceRef = {
  controlGroup: string;
  room: string;
  deviceId: string;
};

export function formatDeviceLabel({ controlGroup, room, deviceId }: DeviceRef): string {
  return `${controlGroup} / ${room} / ${deviceId}`;
}

export function getDeviceState(context: ToolContext, ref: DeviceRef): string | undefined {
  return context[ref.controlGroup]?.[ref.room]?.[ref.deviceId];
}

export function setDeviceState(context: ToolContext, ref: DeviceRef, state: string): boolean {
  if (!context[ref.controlGroup]?.[ref.room] || !(ref.deviceId in context[ref.controlGroup][ref.room])) {
    return false;
  }
  context[ref.controlGroup][ref.room][ref.deviceId] = state;
  return true;
}

export type ListDeviceFilters = {
  stateFilter?: 'ON' | 'OFF';
  controlGroup?: string;
  room?: string;
};

export function listDeviceEntries(
  context: ToolContext,
  filters: ListDeviceFilters = {},
): Array<DeviceRef & { state: string }> {
  const entries: Array<DeviceRef & { state: string }> = [];
  for (const [controlGroup, rooms] of Object.entries(context)) {
    if (filters.controlGroup && controlGroup !== filters.controlGroup) continue;
    for (const [room, devices] of Object.entries(rooms)) {
      if (filters.room && room !== filters.room) continue;
      for (const [deviceId, state] of Object.entries(devices)) {
        if (!filters.stateFilter || state === filters.stateFilter) {
          entries.push({ controlGroup, room, deviceId, state });
        }
      }
    }
  }
  return entries;
}

export const initialContext: ToolContext = {
  light: {
    livingRoom: {
      '1': 'ON',
      '2': 'ON',
      '3': 'ON',
    },
    bathroom: {
      '1': 'ON',
    },
  },
};

export function resetContext(context: ToolContext): void {
  for (const controlGroup of Object.keys(context)) {
    delete context[controlGroup];
  }
  Object.assign(context, structuredClone(initialContext));
}
