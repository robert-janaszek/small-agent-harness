import OpenAI from "openai";
import { SmartHomeTool } from "./tools/types";

type ChatCompletionMessage = OpenAI.Chat.Completions.ChatCompletionMessage;

export const hasToolCalls = (responseMessage: ChatCompletionMessage) => {
  return responseMessage.tool_calls && responseMessage.tool_calls.length > 0;
}

export const runTools = async (responseMessage: ChatCompletionMessage, toolsDefinition: SmartHomeTool<unknown>[]) => {
  if (!responseMessage.tool_calls) {
    return [];
  }

  const toolMessages = []

  for (const toolCall of responseMessage.tool_calls) {
    if (toolCall.type !== 'function') continue;

    const toolName = toolCall.function.name;
    const toolArgs = JSON.parse(toolCall.function.arguments);

    const tool = toolsDefinition.find(t => t.function.name === toolName);
    if (!tool) {
      toolMessages.push(`Unknown tool: ${toolName}, called with arguments ${toolCall.function.arguments}. Use correct tool name`);
      continue;
    }

    let toolResult: string;
    try {
      console.log(`\x1b[33m[Tool call]: ${toolName}(${JSON.stringify(toolArgs)})\x1b[0m`);
      toolResult = await tool.call(toolArgs);
    } catch (error: any) {
      toolResult = JSON.stringify({ error: error.message });
    }

    toolMessages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: toolResult,
    });
  }

  return toolMessages;
}