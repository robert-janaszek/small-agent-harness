import { describe, it, expect } from 'vitest';

import { EventLog, formatEvent, wrapAgentLine } from './eventLog';

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

  it('preserves full agent response content', () => {
    const content = 'All living room lights are now off and the AC is set to 22 degrees.';
    expect(
      formatEvent({
        type: 'agent_response',
        content,
        iterations: 1,
        tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }),
    ).toBe(`agent: ${content}`);
  });
});

describe('wrapAgentLine', () => {
  it('wraps long agent responses across multiple lines', () => {
    expect(
      wrapAgentLine('agent: one two three four five six seven eight nine ten', 20),
    ).toEqual(['agent: one two three', '       four five six', '       seven eight', '       nine ten']);
  });

  it('preserves explicit newlines in agent responses', () => {
    expect(wrapAgentLine('agent: first line\nsecond line', 30)).toEqual([
      'agent: first line',
      '       second line',
    ]);
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

  it('returns no lines when maxLines is zero', () => {
    const log = new EventLog();
    log.append({ type: 'user_command', command: 'hello' });

    expect(log.render(0, 40)).toEqual([]);
  });

  it('clears all lines', () => {
    const log = new EventLog();
    log.append({ type: 'user_command', command: 'hello' });
    log.append({ type: 'user_command', command: 'world' });

    log.clear();

    expect(log.render(10, 40)).toEqual([]);
  });

  it('wraps long agent responses instead of truncating them', () => {
    const log = new EventLog();
    log.append({
      type: 'agent_response',
      content: 'one two three four five six seven eight nine ten',
      iterations: 1,
      tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });

    expect(log.render(10, 20)).toEqual([
      'agent: one two three',
      '       four five six',
      '       seven eight',
      '       nine ten',
    ]);
  });

  it('still truncates non-agent log lines to panel width', () => {
    const log = new EventLog();
    log.append({ type: 'user_command', command: 'this is a very long user command that should be truncated' });

    expect(log.render(10, 20)).toEqual(['> this is a very lo…']);
  });
});
