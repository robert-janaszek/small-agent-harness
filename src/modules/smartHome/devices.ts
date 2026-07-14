import { AcState, acStateSchema, ToolContext } from '../../tools/types';

export const AC_CONTROL_GROUP = 'ac';
export const MIN_AC_TEMPERATURE = 16;
export const MAX_AC_TEMPERATURE = 30;

export type DeviceRef = {
  controlGroup: string;
  room: string;
  deviceId: string;
};

export type AcRef = {
  room: string;
  deviceId: string;
};

export function isAcState(value: unknown): value is AcState {
  return acStateSchema.safeParse(value).success;
}

export function formatDeviceLabel({ controlGroup, room, deviceId }: DeviceRef): string {
  return `${controlGroup} / ${room} / ${deviceId}`;
}

export function formatAcLabel({ room, deviceId }: AcRef): string {
  return `${AC_CONTROL_GROUP} / ${room} / ${deviceId}`;
}

export function formatDeviceValue(value: string | AcState): string {
  if (isAcState(value)) {
    return `${value.power}, target ${value.targetTemperature}°C`;
  }
  return value;
}

export function getDevicePower(value: string | AcState): 'ON' | 'OFF' {
  if (isAcState(value)) return value.power;
  return value as 'ON' | 'OFF';
}

export function getDeviceState(context: ToolContext, ref: DeviceRef): string | undefined {
  const value = context[ref.controlGroup]?.[ref.room]?.[ref.deviceId];
  if (typeof value === 'string') return value;
  return undefined;
}

export function setDeviceState(context: ToolContext, ref: DeviceRef, state: string): boolean {
  const roomDevices = context[ref.controlGroup]?.[ref.room];
  if (!roomDevices || !(ref.deviceId in roomDevices)) return false;
  const current = roomDevices[ref.deviceId];
  if (typeof current !== 'string') return false;
  roomDevices[ref.deviceId] = state;
  return true;
}

export function getAcState(context: ToolContext, ref: AcRef): AcState | undefined {
  const value = context[AC_CONTROL_GROUP]?.[ref.room]?.[ref.deviceId];
  if (isAcState(value)) return value;
  return undefined;
}

export function setAcPower(context: ToolContext, ref: AcRef, power: 'ON' | 'OFF'): boolean {
  const ac = getAcState(context, ref);
  if (!ac) return false;
  ac.power = power;
  return true;
}

export function setAcTemperature(context: ToolContext, ref: AcRef, temperature: number): boolean {
  const ac = getAcState(context, ref);
  if (!ac) return false;
  ac.targetTemperature = temperature;
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
      for (const [deviceId, value] of Object.entries(devices)) {
        const power = getDevicePower(value);
        if (filters.stateFilter && power !== filters.stateFilter) continue;
        entries.push({
          controlGroup,
          room,
          deviceId,
          state: formatDeviceValue(value),
        });
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
      backlitCeiling: 'ON',
    },
    bedroom: {
      ceiling: 'ON',
      backlitWall: 'ON',
    },
    kidsRoom: {
      '1': 'ON',
      '2': 'ON',
    },
    bathroom: {
      ceiling: 'ON',
      mirror: 'ON',
    },
    closet: {
      '1': 'ON',
    },
  },
  ac: {
    livingRoom: {
      '1': { power: 'OFF', targetTemperature: 22 },
    },
  },
  TV: {
    livingRoom: {
      '1': 'OFF',
    },
  },
  waterValve: {
    bathroom: {
      '1': 'ON',
    },
    apartment: {
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
