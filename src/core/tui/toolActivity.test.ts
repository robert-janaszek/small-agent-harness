import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createTool, quoteActivityTarget } from '../tool';
import { formatToolActivity, indexToolActivity } from './toolActivity';

const grep = createTool({
  name: 'grep',
  description: 'grep',
  argsSchema: z.object({ pattern: z.string() }),
  activity: {
    present: 'grepping',
    past: 'grepped',
    target: (args) => quoteActivityTarget(args.pattern),
  },
  call: async () => 'ok',
});

const controlDevice = createTool({
  name: 'controlDevice',
  description: 'control',
  argsSchema: z.object({
    controlGroup: z.string(),
    room: z.string(),
    deviceId: z.string(),
    action: z.enum(['turn_on', 'turn_off']),
  }),
  activity: {
    present: (args) => (args.action === 'turn_off' ? 'turning off' : 'turning on'),
    past: (args) => (args.action === 'turn_off' ? 'turned off' : 'turned on'),
    target: (args) => `${args.controlGroup} ${args.deviceId} in ${args.room}`,
  },
  call: async () => 'ok',
});

const undo = createTool({
  name: 'undo',
  description: 'undo',
  argsSchema: z.object({}),
  activity: {
    present: 'undoing',
    past: 'undid',
  },
  call: async () => 'ok',
});

const fragile = createTool({
  name: 'fragile',
  description: 'fragile',
  argsSchema: z.unknown(),
  activity: {
    present: () => {
      throw new Error('bad args');
    },
    past: () => {
      throw new Error('bad args');
    },
    target: (args) => {
      if (args === null || typeof args !== 'object') {
        throw new Error('bad args');
      }
      return 'ok';
    },
  },
  call: async () => 'ok',
});

const activities = indexToolActivity([grep, controlDevice, undo, fragile]);

function format(name: string, args: unknown, status: 'running' | 'done' | 'failed'): string {
  return formatToolActivity(name, args, status, activities.get(name));
}

describe('formatToolActivity', () => {
  it('uses calling/called/failed when the tool has no activity', () => {
    expect(formatToolActivity('echo', { text: 'hi' }, 'running')).toBe('calling echo');
    expect(formatToolActivity('echo', { text: 'hi' }, 'done')).toBe('called echo');
    expect(formatToolActivity('echo', { text: 'hi' }, 'failed')).toBe('failed echo');
  });

  it('indexes tools by function name', () => {
    expect(activities.get('grep')).toBe(grep.activity);
    expect(activities.get('missing')).toBeUndefined();
  });

  it('combines static verbs with a target', () => {
    expect(format('grep', { pattern: 'TODO' }, 'running')).toBe('grepping "TODO"');
    expect(format('grep', { pattern: 'TODO' }, 'done')).toBe('grepped "TODO"');
    expect(format('undo', {}, 'running')).toBe('undoing');
    expect(format('undo', {}, 'done')).toBe('undid');
  });

  it('resolves function verbs from args', () => {
    expect(
      format(
        'controlDevice',
        { controlGroup: 'light', room: 'kitchen', deviceId: '2', action: 'turn_on' },
        'running',
      ),
    ).toBe('turning on light 2 in kitchen');
    expect(
      format(
        'controlDevice',
        { controlGroup: 'TV', room: 'livingRoom', deviceId: '1', action: 'turn_off' },
        'done',
      ),
    ).toBe('turned off TV 1 in livingRoom');
  });

  it('uses failed to <name> with the same target', () => {
    expect(format('grep', { pattern: 'TODO' }, 'failed')).toBe('failed to grep "TODO"');
    expect(
      format(
        'controlDevice',
        { controlGroup: 'light', room: 'kitchen', deviceId: '2', action: 'turn_on' },
        'failed',
      ),
    ).toBe('failed to controlDevice light 2 in kitchen');
  });

  it('truncates long quoted targets and keeps the quotes', () => {
    const pattern = 'a'.repeat(40);
    expect(format('grep', { pattern }, 'running')).toBe(`grepping "${'a'.repeat(31)}…"`);
  });

  it('falls back to calling/called when an activity formatter throws', () => {
    expect(format('fragile', null, 'running')).toBe('calling fragile');
    expect(format('fragile', { pattern: 1 }, 'done')).toBe('called fragile');
  });
});
