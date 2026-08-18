import { describe, it, expect } from 'vitest';

import { EventLog, formatEvent } from './eventLog';

describe('formatEvent', () => {
  it('formats core conversation events', () => {
    expect(formatEvent({ type: 'user_command', command: 'hello' })).toBe('> hello');
    expect(formatEvent({ type: 'assistant_message', content: 'thinking' })).toBe('assistant: thinking');
    expect(formatEvent({ type: 'agent_response', content: 'done', iterations: 1, tokenUsage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    } })).toBe('agent: done');
    expect(formatEvent({ type: 'error', message: 'boom' })).toBe('ERROR: boom');
  });

  it('formats tool calls and results', () => {
    expect(formatEvent({ type: 'tool_call', name: 'echo', args: { text: 'hi' }, toolCallId: '1' })).toBe(
      'call echo({"text":"hi"})',
    );
    expect(formatEvent({ type: 'tool_result', name: 'echo', content: 'echo:hi', toolCallId: '1' })).toBe(
      '  echo: echo:hi',
    );
  });

  it('formats module envelopes', () => {
    expect(formatEvent({ type: 'module', module: 'echo', event: 'started' })).toBe('module.echo started');
    expect(formatEvent({ type: 'module', module: 'echo', event: 'round_done', payload: { ok: true } })).toBe(
      'module.echo round_done {"ok":true}',
    );
  });

  it('skips module state snapshots and collapses multiline user commands', () => {
    expect(
      formatEvent({
        type: 'module',
        module: 'yamlRepair',
        event: 'state',
        payload: { filePath: '/tmp/yaml-repair-123/broken.work.yaml' },
      }),
    ).toBeNull();
    expect(
      formatEvent({
        type: 'user_command',
        command: 'Repair the YAML work file end-to-end:\n- Fix all syntax errors.',
      }),
    ).toBe('> Repair the YAML work file end-to-end: - Fix all syntax errors.');
  });

  it('skips session chrome, tokens, and empty text', () => {
    expect(formatEvent({ type: 'ready', protocolVersion: 1 })).toBeNull();
    expect(formatEvent({ type: 'session_end', turnCount: 2 })).toBeNull();
    expect(formatEvent({
      type: 'tokens',
      iteration: 1,
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })).toBeNull();
    expect(formatEvent({ type: 'assistant_message', content: '  ' })).toBeNull();
    expect(formatEvent({
      type: 'agent_response',
      content: '',
      iterations: 1,
      tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    })).toBeNull();
  });
});

describe('EventLog', () => {
  it('renders the latest wrapped lines and can be cleared', () => {
    const log = new EventLog();
    log.append({ type: 'user_command', command: 'hello' });
    log.append({ type: 'agent_response', content: 'world', iterations: 1, tokenUsage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    } });
    log.append({ type: 'ready', protocolVersion: 1 });

    expect(log.render(10, 40)).toEqual(['> hello', 'agent: world']);

    log.clear();
    expect(log.render(10, 40)).toEqual([]);
  });

  it('wraps long non-agent lines instead of overflowing the pane', () => {
    const log = new EventLog();
    log.append({
      type: 'user_command',
      command: 'Repair the YAML work file end-to-end and then verify yamlParse',
    });

    const lines = log.render(10, 20);
    expect(lines.every((line) => line.length <= 20)).toBe(true);
    expect(lines.join(' ')).toContain('Repair the YAML');
    expect(lines.join(' ')).toContain('yamlParse');
  });
});
