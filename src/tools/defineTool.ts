import { z } from 'zod';

import { settleToolCall, type ToolCallOptions } from '../core/tool';
import { Tool, ToolActivity, ToolContext, ToolFactory } from './types';

export { quoteActivityTarget, toolFailure } from '../core/tool';

type ToolDefinition<T> = {
  name: string;
  description: string;
  argsSchema: z.ZodType<T>;
  activity: ToolActivity<T>;
  call: (args: T, options?: ToolCallOptions) => Promise<string> | string;
};

type ContextToolDefinition<TArgs, TContext> = {
  name: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  activity: ToolActivity<TArgs>;
  call: (context: TContext, args: TArgs, options?: ToolCallOptions) => Promise<string> | string;
};

export function zodToFunctionParameters(schema: z.ZodTypeAny): Record<string, unknown> {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(schema) as Record<string, unknown>;
  return parameters;
}

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

export function defineTool<TArgs, TContext = ToolContext>(
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
