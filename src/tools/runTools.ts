import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { withToolObservation } from "../observability/langfuse";
import { Tool } from "./types";
import { formatZodError } from "./validation";

type ChatCompletionMessage = OpenAI.Chat.Completions.ChatCompletionMessage;
type ChatCompletionMessageToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

export type ToolRunnerHooks = {
  onAssistantMessage?: (content: string) => void;
  onToolCall?: (name: string, args: unknown, toolCallId: string) => void;
  onToolResult?: (name: string, content: string, toolCallId: string) => void;
};

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

async function recordedToolResult(
  name: string,
  input: unknown,
  produce: () => Promise<string>,
): Promise<string> {
  return withToolObservation({ name, input }, produce);
}

export const runTools = async (
  responseMessage: ChatCompletionMessage,
  toolsDefinition: Tool<any>[],
  hooks: ToolRunnerHooks = {},
): Promise<ChatCompletionMessageParam[]> => {
  if (!responseMessage.tool_calls) {
    return [];
  }

  const assistantContent = formatMessageContent(responseMessage.content);
  if (assistantContent) {
    hooks.onAssistantMessage?.(assistantContent);
  }

  const toolMessages: ChatCompletionMessageParam[] = [];

  for (const toolCall of responseMessage.tool_calls) {
    if (toolCall.type !== 'function') {
      const content = await recordedToolResult(
        'unsupported_tool_call',
        { type: toolCall.type, toolCallId: toolCall.id },
        async () => unsupportedToolCallMessage(toolCall),
      );
      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content,
      });
      continue;
    }

    const toolName = toolCall.function.name;

    const tool = toolsDefinition.find(t => t.function.name === toolName);
    if (!tool) {
      const content = await recordedToolResult(
        toolName,
        { arguments: toolCall.function.arguments },
        async () =>
          `Unknown tool: ${toolName}, called with arguments ${toolCall.function.arguments}. Use correct tool name`,
      );
      toolMessages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content,
      });
      continue;
    }

    let rawArgs: unknown;
    try {
      rawArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      const content = await recordedToolResult(
        toolName,
        { arguments: toolCall.function.arguments },
        async () => 'Invalid tool arguments: malformed JSON',
      );
      toolMessages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content,
      });
      continue;
    }

    const parsedArgs = tool.argsSchema.safeParse(rawArgs);
    if (!parsedArgs.success) {
      const content = await recordedToolResult(
        toolName,
        rawArgs,
        async () => formatZodError(parsedArgs.error, 'Invalid tool arguments'),
      );
      toolMessages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content,
      });
      continue;
    }

    const toolResult = await recordedToolResult(toolName, parsedArgs.data, async () => {
      try {
        hooks.onToolCall?.(toolName, parsedArgs.data, toolCall.id);
        return await tool.call(parsedArgs.data);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ error: message });
      }
    });
    hooks.onToolResult?.(toolName, toolResult, toolCall.id);

    toolMessages.push({
      role: 'tool' as const,
      tool_call_id: toolCall.id,
      content: toolResult,
    });
  }

  return toolMessages;
}
