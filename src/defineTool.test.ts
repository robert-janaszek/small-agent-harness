import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createTool, zodToFunctionParameters } from './defineTool';
import { controlDeviceArgsSchema } from './modules/smartHome/schemas';

describe('defineTool', () => {
  it('generates function.parameters from the Zod schema', () => {
    const tool = createTool({
      name: 'controlDevice',
      description: 'Controls a device',
      argsSchema: controlDeviceArgsSchema,
      call: async () => 'ok',
    });

    expect(tool.function.parameters).toEqual(zodToFunctionParameters(controlDeviceArgsSchema));
    expect(tool.argsSchema).toBe(controlDeviceArgsSchema);
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
