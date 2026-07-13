import OpenAI from "openai";

import { Tool } from "./types";
import { formatZodError } from "./validation";

type ChatCompletionMessage = OpenAI.Chat.Completions.ChatCompletionMessage;

export const hasToolCalls = (responseMessage: ChatCompletionMessage) => {
  return responseMessage.tool_calls && responseMessage.tool_calls.length > 0;
}

export const runTools = async (responseMessage: ChatCompletionMessage, toolsDefinition: Tool<any>[]): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> => {
  if (!responseMessage.tool_calls) {
    return [];
  }

  const toolMessages = [];

  for (const toolCall of responseMessage.tool_calls) {
    if (toolCall.type !== 'function') continue;

    const toolName = toolCall.function.name;

    const tool = toolsDefinition.find(t => t.function.name === toolName);
    if (!tool) {
      toolMessages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: `Unknown tool: ${toolName}, called with arguments ${toolCall.function.arguments}. Use correct tool name`
      });
      continue;
    }

    let rawArgs: unknown;
    try {
      rawArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      toolMessages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: 'Invalid tool arguments: malformed JSON',
      });
      continue;
    }

    const parsedArgs = tool.argsSchema.safeParse(rawArgs);
    if (!parsedArgs.success) {
      toolMessages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: formatZodError(parsedArgs.error, 'Invalid tool arguments'),
      });
      continue;
    }

    let toolResult: string;
    try {
      console.log(`\x1b[33m[Tool call]: ${toolName}(${JSON.stringify(parsedArgs.data)})\x1b[0m`);
      toolResult = await tool.call(parsedArgs.data);
    } catch (error: any) {
      toolResult = JSON.stringify({ error: error.message });
    }

    toolMessages.push({
      role: 'tool' as const,
      tool_call_id: toolCall.id,
      content: toolResult,
    });
  }

  return toolMessages;
}
