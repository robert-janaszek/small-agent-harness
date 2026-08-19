import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import { z } from 'zod';

import type { ToolActivity, ToolCallOptions, ToolExecutionResult } from '../core/tool';

export type { ToolActivity, ToolActivityVerb, ToolCallOptions, ToolExecutionResult } from '../core/tool';

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
  activity: ToolActivity<T>;
  call: (args: T, options?: ToolCallOptions) => Promise<string>;
  execute: (args: T, options?: ToolCallOptions) => Promise<ToolExecutionResult>;
}

export type ToolFactory<TArgs = unknown, TContext = ToolContext> = (
  context: TContext,
) => Tool<TArgs>;
