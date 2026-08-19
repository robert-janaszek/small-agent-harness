import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import OpenAI from 'openai';

import { DiffTerminal } from '../../core/tui/diffTerminal';
import type { ChatCompletionClient } from '../../client/llmClient.type';
import { createEventBus } from '../../core/eventBus';
import { Harness } from '../../core/harness';
import { composeSystemPrompt, HARNESS_PROMPT } from '../../core/module';
import type { CoreEvent } from '../../core/protocol';
import { DefaultRenderer } from '../../core/tui/defaultRenderer';
import type { HarnessConfig } from '../../core/config.validate';
import { getFixturePath } from './context';
import {
  createYamlRepairModule,
  createYamlRepairPanel,
  isYamlRepairStateSnapshot,
  YAML_REPAIR_MODULE_ID,
  YAML_REPAIR_PROMPT,
  type YamlRepairModule,
} from './module';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 5,
};

const modules: YamlRepairModule[] = [];
let stderrSpy: ReturnType<typeof vi.spyOn> | undefined;

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
      event.type === 'module' && event.module === YAML_REPAIR_MODULE_ID && event.event === 'state',
  );
}

function createTrackedModule(): YamlRepairModule {
  if (!stderrSpy) {
    silenceWorkFileLog();
  }
  const module = createYamlRepairModule();
  modules.push(module);
  return module;
}

afterEach(() => {
  while (modules.length > 0) {
    modules.pop()?.context.dispose();
  }
  stderrSpy?.mockRestore();
  stderrSpy = undefined;
});

function silenceWorkFileLog() {
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  return stderrSpy;
}

describe('createYamlRepairModule', () => {
  it('forbids asking the user because there is no human-in-the-loop', () => {
    expect(YAML_REPAIR_PROMPT).toContain('Do not ask questions');
    expect(YAML_REPAIR_PROMPT).toContain('There is no human-in-the-loop');
    expect(YAML_REPAIR_PROMPT).toContain('Finish only when yamlParse reports success');
    expect(YAML_REPAIR_PROMPT).not.toContain('tool-calling harness');
    expect(YAML_REPAIR_PROMPT).not.toContain('Ask only when something is still missing');

    const composed = composeSystemPrompt(HARNESS_PROMPT, [createTrackedModule()]);
    expect(composed).toContain('Do not ask questions');
    expect(composed).toContain('Module instructions override these defaults');
    expect(composed).not.toContain('Ask only when something is still missing');
    expect(composed).not.toContain('This is a conversation with a human');
  });

  it('logs the work file path when the module is created and emits state on session start', () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const workFileLog = silenceWorkFileLog();
    const module = createTrackedModule();
    const harness = new Harness({
      modules: [module],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });

    expect(workFileLog).toHaveBeenCalledWith(`[yamlRepair] work file: ${module.context.filePath}\n`);
    harness.startSession();

    const stateEvent = moduleStateEvents(events).at(-1);
    expect(stateEvent).toMatchObject({
      type: 'module',
      module: YAML_REPAIR_MODULE_ID,
      event: 'state',
    });
    expect(stateEvent?.payload).toMatchObject({
      filePath: module.context.filePath,
      parseStatus: { errorCount: null, ok: false, errors: [], undoHint: null },
    });
  });

  it('emits updated parse status after yamlParse then restores on reset', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const module = createTrackedModule();
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: assistantToolCall('yamlParse', {}) }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('reported parser errors') }],
      });
    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness({
      modules: [module],
      llmClient,
      config: testConfig,
      bus,
    });

    harness.startSession();
    await harness.run('call yamlParse');

    const afterParse = moduleStateEvents(events).at(-1);
    expect(afterParse?.payload).toMatchObject({
      filePath: module.context.filePath,
      parseStatus: { ok: false },
    });
    expect(module.context.parseStatus.errorCount).toBeGreaterThan(0);
    expect(module.context.parseStatus.errors.length).toBeGreaterThan(0);

    harness.resetSession();
    const afterReset = moduleStateEvents(events).at(-1);
    expect(afterReset?.payload).toMatchObject({
      filePath: module.context.filePath,
      parseStatus: { errorCount: null, ok: false, errors: [], undoHint: null },
    });
    expect(module.context.lastParseErrorCount).toBeNull();
    expect(readFileSync(module.context.filePath, 'utf8')).toBe(readFileSync(getFixturePath(), 'utf8'));
  });
});

describe('createYamlRepairPanel', () => {
  it('paints parse status after a state event', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(16, 80, (chunk) => output.push(chunk));
    const panel = createYamlRepairPanel();
    panel.onEvent?.('state', {
      filePath: '/tmp/yaml-repair/broken.work.yaml',
      parseStatus: {
        errorCount: 6,
        ok: false,
        errors: ['1. Missing colon (BAD_SCALAR) Offending line 59, column 8:         group lights'],
        undoHint: null,
      },
    });
    panel.paint({ terminal, startCol: 40, width: 39, height: 14 });
    terminal.flush();

    const text = visibleText(output.join(''));
    expect(text).toContain('Parse status');
    expect(text).toContain('6 errors');
    expect(text).toContain('Latest errors');
    expect(text).toContain('Missing colon');
    expect(text).toContain('/tmp/yaml-repair/broken.work.yaml');
  });

  it('ignores payloads that are not a yaml repair snapshot', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(16, 80, (chunk) => output.push(chunk));
    const panel = createYamlRepairPanel();
    panel.onEvent?.('state', { currentIndex: 0, steps: [] });
    panel.onEvent?.('state', {});
    panel.onEvent?.('state', { light: 'ON' });
    panel.paint({ terminal, startCol: 40, width: 39, height: 14 });
    terminal.flush();

    const text = visibleText(output.join(''));
    expect(text).toContain('Parse status');
    expect(text).toContain('Awaiting first yamlParse');
  });

  it('paints parse status in the default renderer after session start', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(16, 80, (chunk) => output.push(chunk));
    const bus = createEventBus();
    const module = createTrackedModule();
    const harness = new Harness({
      modules: [module],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus, {
      panel: createYamlRepairPanel(),
      panelModuleId: YAML_REPAIR_MODULE_ID,
    });

    harness.startSession();
    output.length = 0;
    terminal.resize(16, 80);
    renderer.refresh();

    const text = visibleText(output.join(''));
    expect(text).toContain('Parse status');
    expect(text).toContain('Awaiting first yamlParse');
    expect(text).toContain('yaml-repair-');
    expect(text).not.toContain('no module');
  });
});

describe('isYamlRepairStateSnapshot', () => {
  it('accepts a parse-status snapshot and rejects unrelated objects', () => {
    expect(
      isYamlRepairStateSnapshot({
        filePath: '/tmp/broken.work.yaml',
        parseStatus: { errorCount: null, ok: false, errors: [], undoHint: null },
      }),
    ).toBe(true);
    expect(isYamlRepairStateSnapshot({ currentIndex: 0, steps: [] })).toBe(false);
    expect(isYamlRepairStateSnapshot({})).toBe(false);
    expect(isYamlRepairStateSnapshot({ filePath: '/tmp/x' })).toBe(false);
  });
});
