import { z } from 'zod';

import { MAX_AC_TEMPERATURE, MIN_AC_TEMPERATURE } from './devices';

export const deviceActionSchema = z.enum(['turn_on', 'turn_off']);
export const deviceStateFilterSchema = z.enum(['ON', 'OFF']);

export const listDevicesArgsSchema = z.object({
  stateFilter: deviceStateFilterSchema.optional().describe('Optional filter by device state'),
  controlGroup: z.string().optional().describe('Optional filter by control group, e.g. light'),
  room: z.string().optional().describe('Optional filter by room, e.g. livingRoom'),
});

export const deviceRefArgsSchema = z.object({
  controlGroup: z.string().min(1).describe('Control group, e.g. light, TV, waterValve'),
  room: z.string().min(1).describe('Room identifier, e.g. livingRoom'),
  deviceId: z.string().min(1).describe('Device identifier within the room, e.g. 1'),
});

export const acRefArgsSchema = z.object({
  room: z.string().min(1).describe('Room identifier, e.g. livingRoom'),
  deviceId: z.string().min(1).describe('AC unit identifier within the room, e.g. 1'),
});

export const getDeviceStatusArgsSchema = deviceRefArgsSchema;

export const controlDeviceArgsSchema = deviceRefArgsSchema.extend({
  action: deviceActionSchema.describe('Action to perform'),
});

export const controlAllDevicesInRoomArgsSchema = z.object({
  controlGroup: z.string().min(1).describe('Control group, e.g. light, switch'),
  room: z.string().min(1).describe('Room identifier, e.g. livingRoom'),
  action: deviceActionSchema.describe('Action to perform'),
});

export const getAcStatusArgsSchema = acRefArgsSchema;

export const controlAcArgsSchema = acRefArgsSchema.extend({
  action: deviceActionSchema.describe('Action to perform'),
});

const acTemperatureMessage = `Temperature must be between ${MIN_AC_TEMPERATURE} and ${MAX_AC_TEMPERATURE}°C`;

export const setAcTemperatureArgsSchema = acRefArgsSchema.extend({
  temperature: z.coerce
    .number()
    .min(MIN_AC_TEMPERATURE, acTemperatureMessage)
    .max(MAX_AC_TEMPERATURE, acTemperatureMessage)
    .describe(`Target temperature in °C (${MIN_AC_TEMPERATURE}-${MAX_AC_TEMPERATURE})`),
});

export type ListDevicesArgs = z.infer<typeof listDevicesArgsSchema>;
export type GetDeviceStatusArgs = z.infer<typeof getDeviceStatusArgsSchema>;
export type ControlDeviceArgs = z.infer<typeof controlDeviceArgsSchema>;
export type ControlAllDevicesInRoomArgs = z.infer<typeof controlAllDevicesInRoomArgsSchema>;
export type GetAcStatusArgs = z.infer<typeof getAcStatusArgsSchema>;
export type ControlAcArgs = z.infer<typeof controlAcArgsSchema>;
export type SetAcTemperatureArgs = z.infer<typeof setAcTemperatureArgsSchema>;
