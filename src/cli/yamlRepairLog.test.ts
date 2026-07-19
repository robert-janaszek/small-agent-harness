import { afterEach, describe, expect, it } from 'vitest';

import { emit, resetEmitWriter } from './jsonl';
import {
  formatYamlRepairEvent,
  formatYamlRepairEventFromJsonLine,
  installYamlRepairLogWriter,
} from './yamlRepairLog';

describe('formatYamlRepairEvent', () => {
  it('formats replace tool calls with old and new strings', () => {
    expect(
      formatYamlRepairEvent({
        type: 'tool_call',
        name: 'replace',
        args: { old_string: 'defaultState: __FILL_FROM_CONTEXT__', new_string: 'defaultState: OFF' },
        toolCallId: '1',
      }),
    ).toBe('→ replace "defaultState: __FILL_FROM_CONTEXT__" → "defaultState: OFF"');

    expect(
      formatYamlRepairEvent({
        type: 'tool_call',
        name: 'replace',
        args: {
          old_string: 'group lights',
          new_string: 'group:\nlights',
          replace_all: true,
        },
        toolCallId: '6',
      }),
    ).toBe('→ replace "group lights" → "group:\\nlights" (all)');
  });

  it('shows leading indentation in replace snippets', () => {
    expect(
      formatYamlRepairEvent({
        type: 'tool_call',
        name: 'replace',
        args: {
          old_string: '        group lights',
          new_string: ' group: lights',
        },
        toolCallId: '8',
      }),
    ).toBe('→ replace "········group lights" → "·group: lights"');
  });

  it('formats grep and read tool calls', () => {
    expect(
      formatYamlRepairEvent({
        type: 'tool_call',
        name: 'grep',
        args: { pattern: '__FILL_FROM_CONTEXT__' },
        toolCallId: '2',
      }),
    ).toBe('→ grep /__FILL_FROM_CONTEXT__/');

    expect(
      formatYamlRepairEvent({
        type: 'tool_call',
        name: 'read',
        args: { offset: 120, limit: 40 },
        toolCallId: '3',
      }),
    ).toBe('→ read lines 120-159');
  });

  it('formats tool results and agent output', () => {
    expect(
      formatYamlRepairEvent({
        type: 'tool_result',
        name: 'replace',
        content: 'Applied 1 replacement successfully.',
        toolCallId: '1',
      }),
    ).toBe('← replace: Applied 1 replacement successfully.');

    expect(
      formatYamlRepairEvent({
        type: 'tool_result',
        name: 'yamlParse',
        content: 'The YAML file failed to parse (575 error(s)). Fix these issues:\n1. ...',
        toolCallId: '7',
      }),
    ).toBe('← yamlParse: 575 error(s)');

    expect(
      formatYamlRepairEvent({
        type: 'agent_response',
        content: 'The file is valid YAML.',
        iterations: 3,
        tokenUsage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
    ).toBe('agent: The file is valid YAML.');
  });

  it('skips noisy events like tokens', () => {
    expect(
      formatYamlRepairEvent({
        type: 'tokens',
        iteration: 1,
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }),
    ).toBeNull();
  });
});

describe('formatYamlRepairEventFromJsonLine', () => {
  it('parses jsonl and formats the event', () => {
    const line = `${JSON.stringify({
      type: 'tool_call',
      name: 'yamlParse',
      args: {},
      toolCallId: '4',
    })}\n`;

    expect(formatYamlRepairEventFromJsonLine(line)).toBe('→ yamlParse');
  });
});

describe('installYamlRepairLogWriter', () => {
  afterEach(() => {
    resetEmitWriter();
  });

  it('suppresses jsonl and prints only human-readable lines', () => {
    const log: string[] = [];

    installYamlRepairLogWriter((line) => log.push(line));

    emit({
      type: 'tool_call',
      name: 'grep',
      args: { pattern: 'error' },
      toolCallId: '5',
    });

    expect(log).toEqual(['→ grep /error/']);
  });
});
