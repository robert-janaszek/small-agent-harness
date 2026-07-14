import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { Tool } from "./types";
import { formatZodError } from "./validation";

type ChatCompletionMessage = OpenAI.Chat.Completions.ChatCompletionMessage;
type ChatCompletionMessageToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

export const hasToolCalls = (responseMessage: ChatCompletionMessage) => {
  return responseMessage.tool_calls && responseMessage.tool_calls.length > 0;
}

export function formatMessageContent(
  content: ChatCompletionMessage['content'],
): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  return '';
}

export function toAssistantHistoryMessage(
  message: ChatCompletionMessage,
): ChatCompletionMessageParam {
  const content = formatMessageContent(message.content);

  if (message.tool_calls?.length) {
    return {
      role: 'assistant',
      content: content || null,
      tool_calls: message.tool_calls,
    };
  }

  return {
    role: 'assistant',
    content,
  };
}

function unsupportedToolCallMessage(toolCall: ChatCompletionMessageToolCall): string {
  if (toolCall.type === 'custom') {
    return `Custom tool "${toolCall.custom.name}" is not supported. Use the provided function tools.`;
  }

  return `Unsupported tool call type "${toolCall.type}". Use the provided function tools.`;
}

export const runTools = async (
  responseMessage: ChatCompletionMessage,
  toolsDefinition: Tool<any>[],
): Promise<ChatCompletionMessageParam[]> => {
  if (!responseMessage.tool_calls) {
    return [];
  }

  const assistantContent = formatMessageContent(responseMessage.content);
  if (assistantContent) {
    console.log(`\x1b[35m[Assistant]: ${assistantContent}\x1b[0m`);
  }

  const toolMessages: ChatCompletionMessageParam[] = [];

  for (const toolCall of responseMessage.tool_calls) {
    if (toolCall.type !== 'function') {
      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: unsupportedToolCallMessage(toolCall),
      });
      continue;
    }

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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toolResult = JSON.stringify({ error: message });
    }

    toolMessages.push({
      role: 'tool' as const,
      tool_call_id: toolCall.id,
      content: toolResult,
    });
  }

  return toolMessages;
}
