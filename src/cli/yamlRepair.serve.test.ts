import { afterEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ChatCompletionClient } from '../client/llmClient.type';
import { parseYamlRepairArgv } from './yamlRepairArgv';
import { Harness } from '../harness/harness';
import type { HarnessConfig } from '../harness/harness.config.validate';
import { resetEmitWriter, setEmitWriter, type HarnessEvent } from './jsonl';
import { emitHarnessStartup, runHarnessServeSession } from './sessionLoop';
import { createYamlRepairAgent } from '../modules/yamlRepair/agent';
import { createContext, getFixturePath, resetContext } from '../modules/yamlRepair/context';
import { emitYamlRepairSessionStart } from '../modules/yamlRepair/protocol';
import { YAML_REPAIR_DEFAULT_COMMAND } from '../modules/yamlRepair/defaultCommand';

const testConfig: HarnessConfig = {
  openaiBaseUrl: 'http://127.0.0.1:1234/v1',
  openaiApiKey: 'test-key',
  modelName: 'test-model',
  maxIterations: 3,
};

describe('parseYamlRepairArgv', () => {
  it('selects serve mode', () => {
    expect(parseYamlRepairArgv(['--serve'])).toEqual({
      mode: 'serve',
      command: '',
      human: false,
    });
  });

  it('selects repl mode when argv is empty', () => {
    expect(parseYamlRepairArgv([])).toEqual({
      mode: 'repl',
      command: '',
      human: false,
    });
  });

  it('selects batch mode with explicit command', () => {
    expect(parseYamlRepairArgv(['fix syntax only'])).toEqual({
      mode: 'batch',
      command: 'fix syntax only',
      human: false,
    });
  });

  it('uses the default repair command with --default', () => {
    expect(parseYamlRepairArgv(['--default'])).toEqual({
      mode: 'batch',
      command: YAML_REPAIR_DEFAULT_COMMAND,
      human: false,
    });
  });

  it('tracks --human separately from mode selection', () => {
    expect(parseYamlRepairArgv(['--default', '--human'])).toEqual({
      mode: 'batch',
      command: YAML_REPAIR_DEFAULT_COMMAND,
      human: true,
    });
  });
});

describe('resetContext', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('restores the work file from the fixture and clears history', () => {
    dir = mkdtempSync(join(tmpdir(), 'yaml-repair-reset-'));
    const filePath = join(dir, 'work.yaml');
    writeFileSync(filePath, 'edited content\n', 'utf8');

    const context = createContext(filePath);
    context.history.push('snapshot');
    context.lastParseErrorCount = 12;

    resetContext(context);

    expect(readFileSync(filePath, 'utf8')).toBe(readFileSync(getFixturePath(), 'utf8'));
    expect(context.history.length()).toBe(0);
    expect(context.lastParseErrorCount).toBeNull();
  });
});

describe('yamlRepair harness protocol', () => {
  afterEach(() => {
    resetEmitWriter();
  });

  it('emits ready and context_init on startup', () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const agent = createYamlRepairAgent();
    const harness = new Harness(agent, {
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
    });

    emitHarnessStartup(harness);

    expect(events).toEqual([
      { type: 'ready', protocolVersion: 1 },
      { type: 'context_init', changes: [] },
    ]);
    expect(stderrSpy).toHaveBeenCalledWith(`[yamlRepair] work file: ${agent.context.filePath}\n`);

    stderrSpy.mockRestore();
    agent.context.dispose();
  });

  it('handles serve session with reset over stdin', async () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'first', refusal: null } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'second', refusal: null } }],
      });

    const llmClient: ChatCompletionClient = { createChatCompletion };
    const agent = createYamlRepairAgent();
    const harness = new Harness(agent, { llmClient, config: testConfig });

    const stdin = new PassThrough();
    const session = runHarnessServeSession(harness, stdin);

    stdin.write('{"type":"user_command","command":"hello"}\n');
    stdin.write('{"type":"reset"}\n');
    stdin.write('{"type":"user_command","command":"again"}\n');
    stdin.write('{"type":"shutdown"}\n');
    stdin.end();

    await session;

    expect(events[0]).toEqual({ type: 'ready', protocolVersion: 1 });
    expect(events[1]).toEqual({ type: 'context_init', changes: [] });
    expect(events.filter((event) => event.type === 'context_init').length).toBe(2);
    expect(events.some((event) => event.type === 'agent_response' && event.content === 'second')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'session_end', turnCount: 1 });

    agent.context.dispose();
  });
});

describe('emitYamlRepairSessionStart', () => {
  afterEach(() => {
    resetEmitWriter();
  });

  it('logs the work file path on stderr and emits context_init', () => {
    const events: HarnessEvent[] = [];
    setEmitWriter((line) => {
      events.push(JSON.parse(line.trimEnd()) as HarnessEvent);
    });

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const context = createContext();

    emitYamlRepairSessionStart(context);

    expect(events).toEqual([{ type: 'context_init', changes: [] }]);
    expect(stderrSpy).toHaveBeenCalledWith(`[yamlRepair] work file: ${context.filePath}\n`);

    stderrSpy.mockRestore();
    context.dispose();
  });
});
