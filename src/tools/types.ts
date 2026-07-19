import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
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

export interface Tool<T = unknown> extends ChatCompletionFunctionTool {
  argsSchema: z.ZodType<T>;
  call: (args: T) => Promise<string>;
}

export type ToolFactory<TArgs = unknown, TContext = ToolContext> = (
  context: TContext,
) => Tool<TArgs>;
