import OpenAI from 'openai';

export type ChatCompletionRequestOptions = OpenAI.RequestOptions & {
  onTextDelta?: (delta: string) => void;
  onTextDeltaCancel?: () => void;
};

export type ChatCompletionClient = {
  createChatCompletion(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    options?: ChatCompletionRequestOptions,
  ): Promise<OpenAI.Chat.Completions.ChatCompletion>;
};
