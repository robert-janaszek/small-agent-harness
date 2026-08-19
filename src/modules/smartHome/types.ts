import { z } from 'zod';

export const acStateSchema = z.object({
  power: z.enum(['ON', 'OFF']),
  targetTemperature: z.number(),
});

export type AcState = z.infer<typeof acStateSchema>;

export type DeviceValue = string | AcState;
export type DeviceState = Record<string, DeviceValue>;
export type RoomState = Record<string, DeviceState>;
export type ToolContext = Record<string, RoomState>;
