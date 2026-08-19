import { describe, it, expect } from 'vitest';

import { EventLog, formatEvent } from './eventLog';
import { indexToolActivity } from './toolActivity';
import type { YamlRepairContext } from '../../modules/yamlRepair/context';
import { grepTool } from '../../modules/yamlRepair/grep.tool';

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

  it('formats running tool calls and skips result previews', () => {
    expect(formatEvent({ type: 'tool_call', name: 'echo', args: { text: 'hi' }, toolCallId: '1' })).toBe(
      'calling echo',
    );
    expect(
      formatEvent(
        { type: 'tool_call', name: 'grep', args: { pattern: 'TODO' }, toolCallId: '2' },
        indexToolActivity([grepTool({} as YamlRepairContext)]),
      ),
    ).toBe('grepping "TODO"');
    expect(formatEvent({ type: 'tool_result', name: 'echo', content: 'echo:hi', toolCallId: '1' })).toBeNull();
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

  it('updates the same tool line from present to past without a result preview', () => {
    const log = new EventLog(indexToolActivity([grepTool({} as YamlRepairContext)]));
    log.append({ type: 'tool_call', name: 'grep', args: { pattern: 'TODO' }, toolCallId: '1' });
    log.append({ type: 'user_command', command: 'keep me' });

    expect(log.render(10, 40)).toEqual(['grepping "TODO"', '> keep me']);

    log.append({ type: 'tool_result', name: 'grep', content: 'Found 1 match', toolCallId: '1' });

    expect(log.render(10, 40)).toEqual(['grepped "TODO"', '> keep me']);
  });

  it('uses calling/called for unmapped tools and ignores unmatched results', () => {
    const log = new EventLog();
    log.append({ type: 'tool_call', name: 'echo', args: { text: 'hi' }, toolCallId: '1' });
    log.append({ type: 'tool_result', name: 'echo', content: 'echo:hi', toolCallId: 'missing' });

    expect(log.render(10, 40)).toEqual(['calling echo']);

    log.append({ type: 'tool_result', name: 'echo', content: 'echo:hi', toolCallId: '1' });

    expect(log.render(10, 40)).toEqual(['called echo']);
  });

  it('renders a fallback line when stored tool args cannot be formatted', () => {
    const log = new EventLog(indexToolActivity([grepTool({} as YamlRepairContext)]));
    log.append({ type: 'tool_call', name: 'grep', args: null, toolCallId: '1' });

    expect(log.render(10, 40)).toEqual(['calling grep']);
  });
});
