import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';

export interface ToolContext {
  knownDevices: string[];
  deviceState: Record<string, string>;
}

export interface SmartHomeTool extends ChatCompletionFunctionTool {
  call: (args: any) => Promise<string>;
}

export type ToolFactory = (context: ToolContext) => SmartHomeTool;
