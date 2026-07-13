import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import { z } from 'zod';

export type AcState = {
  power: 'ON' | 'OFF';
  targetTemperature: number;
};

export type DeviceValue = string | AcState;
export type DeviceState = Record<string, DeviceValue>;
export type RoomState = Record<string, DeviceState>;
export type ToolContext = Record<string, RoomState>;

export interface Tool<T = unknown> extends ChatCompletionFunctionTool {
  argsSchema: z.ZodType<T>;
  call: (args: T) => Promise<string>;
}

export type ToolFactory<T> = (context: ToolContext) => Tool<T>;
