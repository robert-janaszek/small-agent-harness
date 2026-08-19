import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import { z } from 'zod';

export type ToolActivityVerb<T = unknown> = string | ((args: T) => string);

export type ToolActivity<T = unknown> = {
  present: ToolActivityVerb<T>;
  past: ToolActivityVerb<T>;
  failed?: ToolActivityVerb<T>;
  target?: (args: T) => string | null;
};

export type ToolCallOptions = {
  signal?: AbortSignal;
};

export type ToolExecutionResult = {
  content: string;
  failed: boolean;
};

export class ToolFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolFailure';
  }
}

export function toolFailure(message: string): never {
  throw new ToolFailure(message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function settleToolCall(
  produce: () => Promise<string> | string,
): Promise<ToolExecutionResult> {
  try {
    return { content: await produce(), failed: false };
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw error;
    }
    if (error instanceof ToolFailure) {
      return { content: error.message, failed: true };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { content: JSON.stringify({ error: message }), failed: true };
  }
}

const MAX_QUOTED_TARGET = 32;

export function quoteActivityTarget(value: string, max = MAX_QUOTED_TARGET): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) {
    return `"${collapsed}"`;
  }
  if (max <= 1) {
    return '"…"';
  }
  return `"${collapsed.slice(0, max - 1)}…"`;
}

export interface Tool<T = unknown> extends ChatCompletionFunctionTool {
  argsSchema: z.ZodType<T>;
  activity: ToolActivity<T>;
  call: (args: T, options?: ToolCallOptions) => Promise<string>;
  execute: (args: T, options?: ToolCallOptions) => Promise<ToolExecutionResult>;
}

type ToolDefinition<T> = {
  name: string;
  description: string;
  argsSchema: z.ZodType<T>;
  activity: ToolActivity<T>;
  call: (args: T, options?: ToolCallOptions) => Promise<string> | string;
};

export function zodToFunctionParameters(schema: z.ZodTypeAny): Record<string, unknown> {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(schema) as Record<string, unknown>;
  return parameters;
}

export type ToolFactory<TArgs = unknown, TContext = unknown> = (
  context: TContext,
) => Tool<TArgs>;

type ContextToolDefinition<TArgs, TContext> = {
  name: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  activity: ToolActivity<TArgs>;
  call: (context: TContext, args: TArgs, options?: ToolCallOptions) => Promise<string> | string;
};

export function createTool<T>(definition: ToolDefinition<T>): Tool<T> {
  const execute = async (args: T, options?: ToolCallOptions) =>
    settleToolCall(() => definition.call(args, options));

  return {
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: zodToFunctionParameters(definition.argsSchema),
    },
    argsSchema: definition.argsSchema,
    activity: definition.activity,
    execute,
    call: async (args, options) => (await execute(args, options)).content,
  };
}

export function defineTool<TArgs, TContext>(
  definition: ContextToolDefinition<TArgs, TContext>,
): ToolFactory<TArgs, TContext> {
  return (context) =>
    createTool({
      name: definition.name,
      description: definition.description,
      argsSchema: definition.argsSchema,
      activity: definition.activity,
      call: (args, options) => definition.call(context, args, options),
    });
}
