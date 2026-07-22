import { describe, it, expect } from 'vitest';

import { EventLog, formatEvent } from './eventLog';

describe('formatEvent', () => {
  it('formats user command', () => {
    expect(formatEvent({ type: 'user_command', command: 'turn off lights' })).toBe('> turn off lights');
  });

  it('summarizes listDevices JSON result', () => {
    expect(
      formatEvent({
        type: 'tool_result',
        name: 'listDevices',
        content: JSON.stringify({ devices: [{}, {}, {}] }),
        toolCallId: '1',
      }),
    ).toBe('  listDevices: listDevices → 3 devices');
  });

  it('formats context delta', () => {
    expect(
      formatEvent({
        type: 'context_delta',
        changes: [{ controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' }],
      }),
    ).toBe('state Δ 1 change(s)');
  });

  it('formats context init', () => {
    expect(
      formatEvent({
        type: 'context_init',
        changes: [
          { controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'ON' },
          { controlGroup: 'light', room: 'livingRoom', deviceId: '2', value: 'ON' },
        ],
      }),
    ).toBe('state init 2 device(s)');
  });
});

describe('EventLog', () => {
  it('skips empty agent responses', () => {
    const log = new EventLog();
    log.append({ type: 'agent_response', content: '', iterations: 1, tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
    log.append({ type: 'agent_response', content: 'done', iterations: 1, tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });

    expect(log.render(10, 40)).toEqual(['agent: done']);
  });

  it('appends context_init events', () => {
    const log = new EventLog();
    log.append({
      type: 'context_init',
      changes: [{ controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'ON' }],
    });

    expect(log.render(10, 40)).toEqual(['state init 1 device(s)']);
  });
});
