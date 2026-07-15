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
});

describe('EventLog', () => {
  it('keeps only the last N visible lines', () => {
    const log = new EventLog();
    for (let i = 0; i < 10; i++) {
      log.append({ type: 'user_command', command: `cmd ${i}` });
    }

    const lines = log.render(3, 40);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('> cmd 7');
    expect(lines[2]).toBe('> cmd 9');
  });
});
