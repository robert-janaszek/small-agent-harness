import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';

export type DeviceState = Record<string, string>;
export type RoomState = Record<string, DeviceState>;
export type ToolContext = Record<string, RoomState>;

export interface Tool<T> extends ChatCompletionFunctionTool {
  call: (args: T) => Promise<string>;
}

export type ToolFactory<T> = (context: ToolContext) => Tool<T>;
