import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';

export interface ToolContext {
  knownDevices: string[];
  deviceState: Record<string, string>;
}

export interface SmartHomeTool<T> extends ChatCompletionFunctionTool {
  call: (args: T) => Promise<string>;
}

export type ToolFactory<T> = (context: ToolContext) => SmartHomeTool<T>;
