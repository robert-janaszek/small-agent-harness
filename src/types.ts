import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';

export interface ToolContext {
  deviceState: Record<string, string>;
}

export interface Tool<T> extends ChatCompletionFunctionTool {
  call: (args: T) => Promise<string>;
}

export type ToolFactory<T> = (context: ToolContext) => Tool<T>;
