import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createTool, defineTool, toolFailure, zodToFunctionParameters } from './tool';

const argsSchema = z.object({
  controlGroup: z.string().min(1),
  room: z.string().min(1),
  deviceId: z.string().min(1),
  action: z.enum(['turn_on', 'turn_off']),
});

describe('createTool', () => {
  it('generates function.parameters from the Zod schema', () => {
    const tool = createTool({
      name: 'controlDevice',
      description: 'Controls a device',
      argsSchema,
      activity: { present: 'controlling', past: 'controlled' },
      call: async () => 'ok',
    });

    expect(tool.function.parameters).toEqual(zodToFunctionParameters(argsSchema));
    expect(tool.argsSchema).toBe(argsSchema);
    expect(tool.activity).toEqual({ present: 'controlling', past: 'controlled' });
  });

  it('returns ToolFailure messages from call and marks execute as failed', async () => {
    const tool = createTool({
      name: 'failing',
      description: 'failing',
      argsSchema: z.object({}),
      activity: { present: 'failing', past: 'failed' },
      call: () => toolFailure('nope'),
    });

    await expect(tool.call({})).resolves.toBe('nope');
    await expect(tool.execute({})).resolves.toEqual({ content: 'nope', failed: true });
  });

  it('includes required fields and constraints in generated parameters', () => {
    expect(zodToFunctionParameters(argsSchema)).toMatchObject({
      type: 'object',
      required: ['controlGroup', 'room', 'deviceId', 'action'],
      properties: {
        controlGroup: { type: 'string', minLength: 1 },
        action: { type: 'string', enum: ['turn_on', 'turn_off'] },
      },
    });
  });

  it('generates temperature bounds for numeric schemas', () => {
    const schema = z.object({
      temperature: z.coerce.number().min(16).max(30),
    });

    expect(zodToFunctionParameters(schema)).toMatchObject({
      properties: {
        temperature: { type: 'number', minimum: 16, maximum: 30 },
      },
    });
  });
});

describe('defineTool', () => {
  it('binds context into the created tool', async () => {
    const factory = defineTool({
      name: 'echoContext',
      description: 'echo',
      argsSchema: z.object({ suffix: z.string() }),
      activity: { present: 'echoing', past: 'echoed' },
      call: (context: { prefix: string }, args) => `${context.prefix}:${args.suffix}`,
    });

    const tool = factory({ prefix: 'hello' });
    await expect(tool.call({ suffix: 'world' })).resolves.toBe('hello:world');
  });
});
