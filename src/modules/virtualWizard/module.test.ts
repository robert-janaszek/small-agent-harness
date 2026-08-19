import { describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';

import { DiffTerminal } from '../../core/tui/diffTerminal';
import type { ChatCompletionClient } from '../../client/llmClient.type';
import { createEventBus } from '../../core/eventBus';
import { Harness } from '../../core/harness';
import type { CoreEvent } from '../../core/protocol';
import { parseRunArgv, resolveHostMode } from '../../core/run';
import { DefaultRenderer } from '../../core/tui/defaultRenderer';
import type { HarnessConfig } from '../../core/config.validate';
import {
  createVirtualWizardModule,
  createVirtualWizardPanel,
  resolveVirtualWizardDefaultCommand,
  VIRTUAL_WIZARD_MODULE_ID,
  VIRTUAL_WIZARD_PROMPT,
  VIRTUAL_WIZARD_START_COMMAND,
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
      event.type === 'module' && event.module === VIRTUAL_WIZARD_MODULE_ID && event.event === 'state',
  );
}

describe('resolveVirtualWizardDefaultCommand', () => {
  it('auto-starts the TUI and keeps JSONL host open without a command', () => {
    expect(resolveVirtualWizardDefaultCommand([])).toBe(VIRTUAL_WIZARD_START_COMMAND);
    expect(resolveVirtualWizardDefaultCommand(['--jsonl'])).toBeUndefined();
    expect(resolveVirtualWizardDefaultCommand(['--jsonl', '--default'])).toBe(VIRTUAL_WIZARD_START_COMMAND);

    expect(
      resolveHostMode(parseRunArgv([]), {
        tty: true,
        defaultCommand: resolveVirtualWizardDefaultCommand([]),
      }),
    ).toEqual({ mode: 'tui', command: VIRTUAL_WIZARD_START_COMMAND });
    expect(
      resolveHostMode(parseRunArgv(['--jsonl']), {
        tty: true,
        defaultCommand: resolveVirtualWizardDefaultCommand(['--jsonl']),
      }),
    ).toEqual({ mode: 'jsonl-serve', command: '' });
    expect(
      resolveHostMode(parseRunArgv(['--jsonl', '--default']), {
        tty: true,
        defaultCommand: resolveVirtualWizardDefaultCommand(['--jsonl', '--default']),
      }),
    ).toEqual({ mode: 'jsonl-batch', command: VIRTUAL_WIZARD_START_COMMAND });
  });
});

describe('createVirtualWizardModule', () => {
  it('asks for missing answers but invents values when the user says to', () => {
    expect(VIRTUAL_WIZARD_PROMPT).toContain('Gather what you need from the user');
    expect(VIRTUAL_WIZARD_PROMPT).toContain('Listen to the user');
    expect(VIRTUAL_WIZARD_PROMPT).toContain('If they ask you to invent a field');
    expect(VIRTUAL_WIZARD_PROMPT).toContain('Do not refuse and re-ask for the same field');
    expect(VIRTUAL_WIZARD_PROMPT).not.toContain('There is no human-in-the-loop');
    expect(VIRTUAL_WIZARD_PROMPT).not.toContain('tool-calling harness');
    expect(VIRTUAL_WIZARD_PROMPT).not.toContain('Do not invent missing values');
  });

  it('emits a namespaced state snapshot on session start', () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const harness = new Harness({
      modules: [createVirtualWizardModule()],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });

    harness.startSession();

    const stateEvent = moduleStateEvents(events).at(-1);
    expect(stateEvent).toMatchObject({
      type: 'module',
      module: VIRTUAL_WIZARD_MODULE_ID,
      event: 'state',
    });
    expect(stateEvent?.payload).toMatchObject({
      currentIndex: 0,
      steps: expect.arrayContaining([expect.objectContaining({ title: 'Welcome', validated: false })]),
    });
  });

  it('advances after tools then returns to step 0 on reset', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: assistantToolCall('validateCurrentStep', {}) }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantToolCall('nextStep', {}, 'call_2') }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('moved') }],
      });
    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness({
      modules: [createVirtualWizardModule()],
      llmClient,
      config: testConfig,
      bus,
    });

    harness.startSession();
    await harness.run('complete the welcome step');

    const afterAdvance = moduleStateEvents(events).at(-1);
    expect(afterAdvance?.payload).toMatchObject({ currentIndex: 1 });

    harness.resetSession();
    const afterReset = moduleStateEvents(events).at(-1);
    expect(afterReset?.payload).toMatchObject({
      currentIndex: 0,
      steps: expect.arrayContaining([expect.objectContaining({ title: 'Welcome', validated: false })]),
    });
  });
});

describe('createVirtualWizardPanel', () => {
  it('paints the Welcome step after a state event', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(12, 80, (chunk) => output.push(chunk));
    const panel = createVirtualWizardPanel();
    panel.onEvent?.('state', {
      currentIndex: 0,
      steps: [{ id: 'welcome', title: 'Welcome', validated: false, lastError: null }],
    });
    panel.paint({ terminal, startCol: 40, width: 39, height: 10 });
    terminal.flush();

    expect(visibleText(output.join(''))).toContain('Welcome');
  });

  it('paints Welcome in the default renderer after session start', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(12, 80, (chunk) => output.push(chunk));
    const bus = createEventBus();
    const harness = new Harness({
      modules: [createVirtualWizardModule()],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus, {
      panel: createVirtualWizardPanel(),
      panelModuleId: VIRTUAL_WIZARD_MODULE_ID,
    });

    harness.startSession();
    output.length = 0;
    terminal.resize(12, 80);
    renderer.refresh();

    const text = visibleText(output.join(''));
    expect(text).toContain('Welcome');
    expect(text).not.toContain('no module');
  });
});
