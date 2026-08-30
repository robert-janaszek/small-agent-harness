import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { createTool, quoteActivityTarget } from '../tool';
import { colors } from './colors';
import { EventLog, formatEvent, formatThoughtDuration, wrapAgentLine } from './eventLog';
import { indexToolActivity } from './toolActivity';

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

const grepActivity = indexToolActivity([grep]);

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
        indexToolActivity([grep]),
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

describe('wrapAgentLine', () => {
  it('does not render an agent header when there is no visible content', () => {
    expect(wrapAgentLine('agent: ', 40)).toEqual([]);
    expect(wrapAgentLine('agent: \n', 40)).toEqual([]);
    expect(wrapAgentLine('assistant:   ', 40)).toEqual([]);
    expect(wrapAgentLine('think: ', 40)).toEqual([]);
  });

  it('does not leave a blank line from leading or trailing newlines', () => {
    expect(wrapAgentLine('agent: \nHello', 40)).toEqual(['agent: Hello']);
    expect(wrapAgentLine('agent: Hello\n', 40)).toEqual(['agent: Hello']);
    expect(wrapAgentLine('agent: \nHello\n', 40)).toEqual(['agent: Hello']);
  });

  it('keeps a blank line between paragraphs', () => {
    expect(wrapAgentLine('agent: Hello\n\nWorld', 40)).toEqual(['agent: Hello', '       ', '       World']);
  });

  it('wraps think lines with the think prefix', () => {
    expect(wrapAgentLine('think: looking at tools', 40)).toEqual(['think: looking at tools']);
  });
});

describe('formatThoughtDuration', () => {
  it('rounds to whole seconds and uses singular for one', () => {
    expect(formatThoughtDuration(0)).toBe('thought for 1 second');
    expect(formatThoughtDuration(1400)).toBe('thought for 1 second');
    expect(formatThoughtDuration(1600)).toBe('thought for 2 seconds');
    expect(formatThoughtDuration(5000)).toBe('thought for 5 seconds');
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
    const log = new EventLog(grepActivity);
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

  it('marks a matching tool line as failed instead of past-tense success', () => {
    const log = new EventLog(grepActivity);
    log.append({ type: 'tool_call', name: 'grep', args: { pattern: 'TODO' }, toolCallId: '1' });
    log.append({
      type: 'tool_result',
      name: 'grep',
      content: 'Could not compile pattern: bad',
      toolCallId: '1',
      failed: true,
    });

    expect(log.render(10, 40)).toEqual(['failed to grep "TODO"']);
  });

  it('renders a fallback line when stored tool args cannot be formatted', () => {
    const log = new EventLog(grepActivity);
    log.append({ type: 'tool_call', name: 'grep', args: null, toolCallId: '1' });

    expect(log.render(10, 40)).toEqual(['calling grep']);
  });

  it('does not show an agent header until a delta has visible text', () => {
    const log = new EventLog();
    log.append({ type: 'user_command', command: 'hi' });
    log.appendDelta('  ');
    log.appendDelta('\n');

    expect(log.render(10, 40)).toEqual(['> hi']);

    log.appendDelta('Hello');
    expect(log.render(10, 40)).toEqual(['> hi', 'agent: Hello']);
  });

  it('does not flash an agent header when whitespace is followed by a tool call', () => {
    const log = new EventLog(grepActivity);
    log.appendDelta('\n');
    log.appendDelta(' ');
    log.append({ type: 'tool_call', name: 'grep', args: { pattern: 'TODO' }, toolCallId: '1' });

    expect(log.render(10, 40)).toEqual(['grepping "TODO"']);
  });

  it('grows a single agent line from deltas and finalizes it on agent_response', () => {
    const log = new EventLog();
    log.append({ type: 'user_command', command: 'hi' });
    log.appendDelta('Hel');
    log.appendDelta('lo');

    expect(log.render(10, 40)).toEqual(['> hi', 'agent: Hello']);

    log.append({
      type: 'agent_response',
      content: 'Hello',
      iterations: 1,
      tokenUsage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    expect(log.render(10, 40)).toEqual(['> hi', 'agent: Hello']);
  });

  it('keeps streamed text on the agent line when deltas start or end with a newline', () => {
    const log = new EventLog();
    log.appendDelta('\nHello');
    log.appendDelta('\n');

    expect(log.render(10, 40)).toEqual(['agent: Hello']);

    log.append({
      type: 'agent_response',
      content: 'Hello',
      iterations: 1,
      tokenUsage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    expect(log.render(10, 40)).toEqual(['agent: Hello']);
  });

  it('keeps streamed text when the final agent_response has no content', () => {
    const log = new EventLog();
    log.appendDelta('thinking about tools');
    log.append({
      type: 'agent_response',
      content: '',
      iterations: 1,
      tokenUsage: { prompt_tokens: 1, completion_tokens: 20, total_tokens: 21 },
    });

    expect(log.render(10, 40)).toEqual(['agent: thinking about tools']);
  });

  it('updates an existing tool line when the same toolCallId is appended again', () => {
    const log = new EventLog(grepActivity);
    log.append({ type: 'tool_call', name: 'grep', args: {}, toolCallId: '1' });
    log.append({ type: 'tool_call', name: 'grep', args: { pattern: 'TODO' }, toolCallId: '1' });

    expect(log.render(10, 40)).toEqual(['grepping "TODO"']);
  });

  it('drops the streaming preview when a tool call starts', () => {
    const log = new EventLog(grepActivity);
    log.appendDelta('thinking');
    log.append({ type: 'tool_call', name: 'grep', args: { pattern: 'TODO' }, toolCallId: '1' });

    expect(log.render(10, 40)).toEqual(['grepping "TODO"']);
  });

  it('drops the streaming preview when assistant_message arrives', () => {
    const log = new EventLog();
    log.appendDelta('partial');
    log.append({ type: 'assistant_message', content: 'thinking' });

    expect(log.render(10, 40)).toEqual(['assistant: thinking']);
  });

  it('drops the streaming preview when an error arrives', () => {
    const log = new EventLog();
    log.append({ type: 'user_command', command: 'hi' });
    log.appendDelta('partial');
    log.append({ type: 'error', message: 'LLM exploded' });

    expect(log.render(10, 40)).toEqual(['> hi', 'ERROR: LLM exploded']);
  });

  it('cancelStreaming removes an in-progress agent line', () => {
    const log = new EventLog();
    log.append({ type: 'user_command', command: 'hi' });
    log.appendDelta('partial');
    log.cancelStreaming();

    expect(log.render(10, 40)).toEqual(['> hi']);
  });

  it('renders reasoning as think lines, then collapses to a duration', () => {
    const log = new EventLog();
    log.append({ type: 'user_command', command: 'hi' });
    log.appendReasoningDelta('maybe ', 1_000);
    log.appendReasoningDelta('no tools', 1_100);

    expect(log.render(10, 40)).toEqual(['> hi', 'think: maybe no tools']);
    expect(log.renderLines(10, 40)).toEqual([
      { text: '> hi' },
      { text: 'think: maybe no tools', trueColorFg: colors.thinking },
    ]);

    log.appendDelta('None yet.', 4_000);

    expect(log.render(10, 40)).toEqual(['> hi', 'thought for 3 seconds', 'agent: None yet.']);
    expect(log.renderLines(10, 40)[1]).toEqual({
      text: 'thought for 3 seconds',
      trueColorFg: colors.thinking,
    });

    log.append({
      type: 'agent_response',
      content: 'None yet.',
      iterations: 1,
      tokenUsage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    expect(log.render(10, 40)).toEqual(['> hi', 'thought for 3 seconds', 'agent: None yet.']);
  });

  it('does not duplicate thinking when the final response is the reasoning fallback', () => {
    const log = new EventLog();
    log.appendReasoningDelta('thinking about tools', 0);
    log.append(
      {
        type: 'agent_response',
        content: 'thinking about tools',
        iterations: 1,
        tokenUsage: { prompt_tokens: 1, completion_tokens: 20, total_tokens: 21 },
      },
      1_000,
    );

    expect(log.render(10, 40)).toEqual(['thought for 1 second']);
  });

  it('treats trailing whitespace as the same reasoning fallback', () => {
    const log = new EventLog();
    log.appendReasoningDelta('thinking about tools\n', 0);
    log.append(
      {
        type: 'agent_response',
        content: 'thinking about tools',
        iterations: 1,
        tokenUsage: { prompt_tokens: 1, completion_tokens: 20, total_tokens: 21 },
      },
      1_000,
    );

    expect(log.render(10, 40)).toEqual(['thought for 1 second']);
  });

  it('marks a streamed tool line as failed when the turn ends without a result', () => {
    const log = new EventLog();
    log.append({ type: 'tool_call', name: 'listDevices', args: {}, toolCallId: 'call_1' });
    log.append({
      type: 'agent_response',
      content: 'No tools are available. Ignored tool call(s): listDevices.',
      iterations: 1,
      tokenUsage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    expect(log.render(10, 80)).toEqual([
      'failed listDevices',
      'agent: No tools are available. Ignored tool call(s): listDevices.',
    ]);
  });

  it('collapses think lines when a tool call starts', () => {
    const log = new EventLog(grepActivity);
    log.appendReasoningDelta('need grep', 0);
    log.append({ type: 'tool_call', name: 'grep', args: { pattern: 'TODO' }, toolCallId: '1' }, 2_000);

    expect(log.render(10, 40)).toEqual(['thought for 2 seconds', 'grepping "TODO"']);
  });
});
