import { ChatCompletionFunctionTool } from 'openai/resources/chat/completions';
import { z } from 'zod';

export type ToolActivityVerb<T = unknown> = string | ((args: T) => string);

export type ToolActivity<T = unknown> = {
  present: ToolActivityVerb<T>;
  past: ToolActivityVerb<T>;
  target?: (args: T) => string | null;
};

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
  call: (args: T) => Promise<string>;
}

type ToolDefinition<T> = {
  name: string;
  description: string;
  argsSchema: z.ZodType<T>;
  activity: ToolActivity<T>;
  call: (args: T) => Promise<string> | string;
};

export function zodToFunctionParameters(schema: z.ZodTypeAny): Record<string, unknown> {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(schema) as Record<string, unknown>;
  return parameters;
}

export function createTool<T>(definition: ToolDefinition<T>): Tool<T> {
  return {
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: zodToFunctionParameters(definition.argsSchema),
    },
    argsSchema: definition.argsSchema,
    activity: definition.activity,
    call: async (args) => definition.call(args),
  };
}
