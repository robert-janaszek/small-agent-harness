import { z } from 'zod';

import { MAX_AC_TEMPERATURE, MIN_AC_TEMPERATURE } from './devices';

export const deviceActionSchema = z.enum(['turn_on', 'turn_off']);
export const deviceStateFilterSchema = z.enum(['ON', 'OFF']);

export const listDevicesArgsSchema = z.object({
  stateFilter: deviceStateFilterSchema.optional(),
  controlGroup: z.string().optional(),
  room: z.string().optional(),
});

export const deviceRefArgsSchema = z.object({
  controlGroup: z.string().min(1),
  room: z.string().min(1),
  deviceId: z.string().min(1),
});

export const acRefArgsSchema = z.object({
  room: z.string().min(1),
  deviceId: z.string().min(1),
});

export const getDeviceStatusArgsSchema = deviceRefArgsSchema;

export const controlDeviceArgsSchema = deviceRefArgsSchema.extend({
  action: deviceActionSchema,
});

export const controlAllDevicesInRoomArgsSchema = z.object({
  controlGroup: z.string().min(1),
  room: z.string().min(1),
  action: deviceActionSchema,
});

export const getAcStatusArgsSchema = acRefArgsSchema;

export const controlAcArgsSchema = acRefArgsSchema.extend({
  action: deviceActionSchema,
});

const acTemperatureMessage = `Temperature must be between ${MIN_AC_TEMPERATURE} and ${MAX_AC_TEMPERATURE}°C`;

export const setAcTemperatureArgsSchema = acRefArgsSchema.extend({
  temperature: z.coerce.number().refine(
    (temperature) => temperature >= MIN_AC_TEMPERATURE && temperature <= MAX_AC_TEMPERATURE,
    acTemperatureMessage,
  ),
});

export type ListDevicesArgs = z.infer<typeof listDevicesArgsSchema>;
export type GetDeviceStatusArgs = z.infer<typeof getDeviceStatusArgsSchema>;
export type ControlDeviceArgs = z.infer<typeof controlDeviceArgsSchema>;
export type ControlAllDevicesInRoomArgs = z.infer<typeof controlAllDevicesInRoomArgsSchema>;
export type GetAcStatusArgs = z.infer<typeof getAcStatusArgsSchema>;
export type ControlAcArgs = z.infer<typeof controlAcArgsSchema>;
export type SetAcTemperatureArgs = z.infer<typeof setAcTemperatureArgsSchema>;
