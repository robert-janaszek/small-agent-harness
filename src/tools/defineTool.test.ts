import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createTool, toolFailure, zodToFunctionParameters } from './defineTool';
import { controlDeviceArgsSchema } from '../modules/smartHome/schemas';

describe('defineTool', () => {
  it('generates function.parameters from the Zod schema', () => {
    const tool = createTool({
      name: 'controlDevice',
      description: 'Controls a device',
      argsSchema: controlDeviceArgsSchema,
      activity: { present: 'controlling', past: 'controlled' },
      call: async () => 'ok',
    });

    expect(tool.function.parameters).toEqual(zodToFunctionParameters(controlDeviceArgsSchema));
    expect(tool.argsSchema).toBe(controlDeviceArgsSchema);
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
    const parameters = zodToFunctionParameters(controlDeviceArgsSchema);

    expect(parameters).toMatchObject({
      type: 'object',
      required: ['controlGroup', 'room', 'deviceId', 'action'],
      properties: {
        controlGroup: { type: 'string', minLength: 1 },
        action: { type: 'string', enum: ['turn_on', 'turn_off'] },
      },
    });
  });

  it('generates temperature bounds for setAcTemperature schema', () => {
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
