import OpenAI from 'openai';

export type ChatCompletionRequestOptions = OpenAI.RequestOptions & {
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onTextDeltaCancel?: () => void;
  onToolCallStart?: (name: string, toolCallId: string) => void;
};

export type ChatCompletionClient = {
  createChatCompletion(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    options?: ChatCompletionRequestOptions,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion>;
};
