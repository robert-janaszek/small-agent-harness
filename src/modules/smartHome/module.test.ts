import { describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';

import { DiffTerminal } from '../../cli/tui/diffTerminal';
import type { ChatCompletionClient } from '../../client/llmClient.type';
import { createEventBus } from '../../core/eventBus';
import { Harness } from '../../core/harness';
import { composeSystemPrompt, HARNESS_PROMPT } from '../../core/module';
import type { CoreEvent } from '../../core/protocol';
import { DefaultRenderer } from '../../core/tui/defaultRenderer';
import type { HarnessConfig } from '../../harness/harness.config.validate';
import { setDeviceState } from './devices';
import {
  createSmartHomeModule,
  createSmartHomePanel,
  SMART_HOME_MODULE_ID,
  SMART_HOME_PROMPT,
} from './module';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 5,
};

function visibleText(output: string): string {
  return output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

function assistantMessage(content: string): OpenAI.Chat.Completions.ChatCompletionMessage {
  return {
    role: 'assistant',
    content,
    refusal: null,
  };
}

function assistantToolCall(
  name: string,
  args: Record<string, unknown>,
  id = 'call_1',
): OpenAI.Chat.Completions.ChatCompletionMessage {
  return {
    role: 'assistant',
    content: null,
    refusal: null,
    tool_calls: [
      {
        id,
        type: 'function',
        function: {
          name,
          arguments: JSON.stringify(args),
        },
      },
    ],
  };
}

function moduleStateEvents(events: CoreEvent[]) {
  return events.filter(
    (event): event is Extract<CoreEvent, { type: 'module' }> =>
      event.type === 'module' && event.module === SMART_HOME_MODULE_ID && event.event === 'state',
  );
}

describe('createSmartHomeModule', () => {
  it('forbids asking the user because they cannot read assistant text', () => {
    expect(SMART_HOME_PROMPT).toContain('Never ask the user a question');
    expect(SMART_HOME_PROMPT).toContain('they cannot read assistant text');
    expect(SMART_HOME_PROMPT).toContain('Always verify that every command actually succeeded');
    expect(SMART_HOME_PROMPT).not.toContain('tool-calling harness');
    expect(SMART_HOME_PROMPT).not.toContain('Ask only when something is still missing');

    const composed = composeSystemPrompt(HARNESS_PROMPT, [createSmartHomeModule()]);
    expect(composed).toContain('Never ask the user a question');
    expect(composed).toContain('Module instructions override these defaults');
    expect(composed).not.toContain('Ask only when something is still missing');
    expect(composed).not.toContain('This is a conversation with a human');
  });

  it('emits a namespaced state snapshot on session start', () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const harness = new Harness({
      modules: [createSmartHomeModule()],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });

    harness.startSession();

    const stateEvent = moduleStateEvents(events).at(-1);
    expect(stateEvent).toMatchObject({
      type: 'module',
      module: SMART_HOME_MODULE_ID,
      event: 'state',
    });
    expect(stateEvent?.payload).toMatchObject({
      light: { livingRoom: { '1': 'ON' } },
      ac: { livingRoom: { '1': { power: 'OFF', targetTemperature: 22 } } },
    });
  });

  it('emits updated state after tools then restores devices on reset', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const module = createSmartHomeModule();
    setDeviceState(module.context, { controlGroup: 'light', room: 'livingRoom', deviceId: '1' }, 'OFF');

    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: assistantToolCall('controlDevice', {
              controlGroup: 'light',
              room: 'livingRoom',
              deviceId: '2',
              action: 'turn_off',
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('done') }],
      });
    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness({
      modules: [module],
      llmClient,
      config: testConfig,
      bus,
    });

    harness.startSession();
    await harness.run('turn off living room light 2');

    const afterAction = moduleStateEvents(events).at(-1);
    expect(afterAction?.payload).toMatchObject({
      light: { livingRoom: { '1': 'OFF', '2': 'OFF' } },
    });
    expect(module.context.light?.livingRoom?.['2']).toBe('OFF');

    harness.resetSession();
    const afterReset = moduleStateEvents(events).at(-1);
    expect(afterReset?.payload).toMatchObject({
      light: { livingRoom: { '1': 'ON', '2': 'ON' } },
    });
    expect(module.context.light?.livingRoom?.['1']).toBe('ON');
    expect(module.context.light?.livingRoom?.['2']).toBe('ON');
  });
});

describe('createSmartHomePanel', () => {
  it('paints the floor plan after a state event', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(16, 80, (chunk) => output.push(chunk));
    const panel = createSmartHomePanel();
    panel.onEvent?.('state', {
      light: { livingRoom: { '1': 'ON', '2': 'ON', '3': 'ON', backlitCeiling: 'ON' } },
      ac: { livingRoom: { '1': { power: 'OFF', targetTemperature: 22 } } },
    });
    panel.paint({ terminal, startCol: 40, width: 39, height: 14 });
    terminal.flush();

    const text = visibleText(output.join(''));
    expect(text).toContain('livingRoom');
    expect(text).toContain('●1');
  });

  it('paints the floor plan in the default renderer after session start', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(16, 80, (chunk) => output.push(chunk));
    const bus = createEventBus();
    const harness = new Harness({
      modules: [createSmartHomeModule()],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus, {
      panel: createSmartHomePanel(),
    });

    harness.startSession();
    output.length = 0;
    terminal.resize(16, 80);
    renderer.refresh();

    const text = visibleText(output.join(''));
    expect(text).toContain('livingRoom');
    expect(text).not.toContain('no module');
  });
});
