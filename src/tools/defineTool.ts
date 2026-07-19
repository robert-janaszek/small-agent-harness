import { z } from 'zod';

import { Tool, ToolContext, ToolFactory } from './types';

type ToolDefinition<T> = {
  name: string;
  description: string;
  argsSchema: z.ZodType<T>;
  call: (args: T) => Promise<string> | string;
};

type ContextToolDefinition<TArgs, TContext> = {
  name: string;
  description: string;
  argsSchema: z.ZodType<TArgs>;
  call: (context: TContext, args: TArgs) => Promise<string> | string;
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
    call: async (args) => definition.call(args),
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
      call: (args) => definition.call(context, args),
    });
}
