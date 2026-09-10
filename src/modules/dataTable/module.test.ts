import { describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';

import type { ChatCompletionClient } from '../../client/llmClient.type';
import { DiffTerminal } from '../../core/tui/diffTerminal';
import { createEventBus } from '../../core/eventBus';
import { Harness } from '../../core/harness';
import { composeSystemPrompt, HARNESS_PROMPT } from '../../core/module';
import type { CoreEvent } from '../../core/protocol';
import { DefaultRenderer } from '../../core/tui/defaultRenderer';
import type { HarnessConfig } from '../../core/config.validate';
import { SALES_COLUMN_COUNT, SALES_COLUMNS, SALES_ROW_COUNT, SALES_TABLE_ID } from './columns';
import {
  createDataTableModule,
  createDataTablePanel,
  DATA_TABLE_MODULE_ID,
  DATA_TABLE_PROMPT,
  isDataTableStateSnapshot,
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
      event.type === 'module' && event.module === DATA_TABLE_MODULE_ID && event.event === 'state',
  );
}

describe('createDataTableModule', () => {
  it('tells the model not to invent or drop rows from memory', () => {
    expect(DATA_TABLE_PROMPT).toContain('Do not count, filter, sort, or aggregate rows in your head');
    expect(DATA_TABLE_PROMPT).toContain('Do not ask the user a question');
    expect(DATA_TABLE_PROMPT).toContain('Call describeTable');
    expect(DATA_TABLE_PROMPT).toContain('Call resetBuffer when you need the original table again');
    expect(DATA_TABLE_PROMPT).toContain('sendBufferToUser');
    expect(DATA_TABLE_PROMPT).toContain('selectColumns');
    expect(DATA_TABLE_PROMPT).toContain('that export is stale');
    expect(DATA_TABLE_PROMPT).toContain('The user cannot see the buffer');
    expect(DATA_TABLE_PROMPT).not.toContain('You currently have no tools');
    expect(DATA_TABLE_PROMPT).not.toContain('There is no tool to send the full buffer');
    expect(DATA_TABLE_PROMPT).not.toContain('tool-calling harness');

    const composed = composeSystemPrompt(HARNESS_PROMPT, [createDataTableModule()]);
    expect(composed).toContain('in-memory tabular buffer');
    expect(composed).toContain(`${SALES_ROW_COUNT} rows x ${SALES_COLUMN_COUNT} columns`);
    expect(composed).toContain('Never sum lineTotal');
    expect(composed).toContain('Module instructions override these defaults');
  });

  it('emits a compact buffer snapshot on session start and after reset', () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const module = createDataTableModule();
    const harness = new Harness({
      modules: [module],
      llmClient: { createChatCompletion: vi.fn().mockResolvedValue({ choices: [{ message: assistantMessage('ok') }] }) },
      config: testConfig,
      bus,
    });

    harness.startSession();

    const started = moduleStateEvents(events).at(-1);
    expect(isDataTableStateSnapshot(started?.payload)).toBe(true);
    expect(started?.payload).toMatchObject({
      sourceId: SALES_TABLE_ID,
      rowCount: SALES_ROW_COUNT,
      columnCount: SALES_COLUMN_COUNT,
      columns: [...SALES_COLUMNS],
    });
    expect(JSON.stringify(started?.payload)).not.toContain('Northwind Logistics');

    module.context.rows.pop();
    module.context.columns = ['rowId'];
    expect(module.context.rows).toHaveLength(SALES_ROW_COUNT - 1);

    harness.resetSession();

    const reset = moduleStateEvents(events).at(-1);
    expect(reset?.payload).toMatchObject({
      sourceId: SALES_TABLE_ID,
      rowCount: SALES_ROW_COUNT,
      columnCount: SALES_COLUMN_COUNT,
      columns: [...SALES_COLUMNS],
    });
    expect(module.context.rows).toHaveLength(SALES_ROW_COUNT);
    expect(module.context.columns).toEqual([...SALES_COLUMNS]);
  });

  it('registers the buffer tools', () => {
    const module = createDataTableModule();
    expect(module.tools?.map((tool) => tool.function.name)).toEqual([
      'describeTable',
      'filterRows',
      'selectColumns',
      'sortRows',
      'aggregate',
      'previewRows',
      'sendBufferToUser',
      'resetBuffer',
    ]);
  });

  it('emits an updated rowCount after filterRows', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const module = createDataTableModule();
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: assistantToolCall('filterRows', {
              where: [{ column: 'region', op: 'eq', value: 'EMEA' }],
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('filtered to EMEA') }],
      });
    const llmClient: ChatCompletionClient = { createChatCompletion };
    const harness = new Harness({
      modules: [module],
      llmClient,
      config: testConfig,
      bus,
    });

    harness.startSession();
    await harness.run('keep EMEA rows');

    expect(module.context.rows.length).toBeGreaterThan(0);
    expect(module.context.rows.length).toBeLessThan(SALES_ROW_COUNT);
    expect(module.context.rows.every((row) => row.region === 'EMEA')).toBe(true);

    const afterFilter = moduleStateEvents(events).at(-1);
    expect(afterFilter?.payload).toMatchObject({
      sourceId: SALES_TABLE_ID,
      rowCount: module.context.rows.length,
      columnCount: SALES_COLUMN_COUNT,
    });
  });

  it('emits a full export payload and keeps cells out of the tool result', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const module = createDataTableModule();
    const createChatCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: assistantToolCall('sendBufferToUser', {}) }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: assistantMessage('sent the buffer') }],
      });
    const harness = new Harness({
      modules: [module],
      llmClient: { createChatCompletion },
      config: testConfig,
      bus,
    });

    harness.startSession();
    await harness.run('send the table to the user');

    const exported = events.find(
      (event): event is Extract<CoreEvent, { type: 'module' }> =>
        event.type === 'module' && event.module === DATA_TABLE_MODULE_ID && event.event === 'export',
    );
    expect(exported?.payload).toMatchObject({
      sourceId: SALES_TABLE_ID,
      rowCount: SALES_ROW_COUNT,
      columnCount: SALES_COLUMN_COUNT,
    });
    const payload = exported?.payload as { rows: unknown[]; columns: string[] };
    expect(payload.rows).toHaveLength(SALES_ROW_COUNT);
    expect(payload.columns).toEqual([...SALES_COLUMNS]);
    expect(JSON.stringify(payload.rows)).toContain('Northwind Logistics');

    const toolResult = events.find(
      (event): event is Extract<CoreEvent, { type: 'tool_result' }> =>
        event.type === 'tool_result' && event.name === 'sendBufferToUser',
    );
    expect(toolResult?.content).toContain('"sent":true');
    expect(toolResult?.content).toContain('do not reprint these rows');
    expect(toolResult?.content).not.toContain('Northwind Logistics');
  });
});

describe('createDataTablePanel', () => {
  it('paints buffer size after a state event', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(16, 80, (chunk) => output.push(chunk));
    const panel = createDataTablePanel();
    panel.onEvent?.('state', {
      sourceId: SALES_TABLE_ID,
      description: 'Synthetic B2B sales line items',
      rowCount: SALES_ROW_COUNT,
      columnCount: SALES_COLUMN_COUNT,
      columns: [...SALES_COLUMNS],
    });
    panel.paint({ terminal, startCol: 40, width: 39, height: 14 });
    terminal.flush();

    const text = visibleText(output.join(''));
    expect(text).toContain('Data buffer');
    expect(text).toContain('sales');
    expect(text).toContain('Synthetic B2B sales line items');
    expect(text).toContain('50 rows x 50 cols');
    expect(text).toContain('(+48)');
  });

  it('ignores payloads that are not a data table snapshot', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(16, 80, (chunk) => output.push(chunk));
    const panel = createDataTablePanel();
    panel.onEvent?.('state', { currentIndex: 0, steps: [] });
    panel.onEvent?.('state', {});
    panel.onEvent?.('state', { light: 'ON' });
    panel.paint({ terminal, startCol: 40, width: 39, height: 14 });
    terminal.flush();

    const text = visibleText(output.join(''));
    expect(text).toContain('Waiting for buffer');
  });

  it('paints buffer size in the default renderer after session start', () => {
    const output: string[] = [];
    const terminal = new DiffTerminal(16, 80, (chunk) => output.push(chunk));
    const bus = createEventBus();
    const harness = new Harness({
      modules: [createDataTableModule()],
      llmClient: { createChatCompletion: vi.fn() },
      config: testConfig,
      bus,
    });
    const renderer = new DefaultRenderer(terminal, harness, bus, {
      panel: createDataTablePanel(),
      panelModuleId: DATA_TABLE_MODULE_ID,
    });

    harness.startSession();
    output.length = 0;
    terminal.resize(16, 80);
    renderer.refresh();

    const text = visibleText(output.join(''));
    expect(text).toContain('Data buffer');
    expect(text).toContain('sales');
    expect(text).toContain('50 rows x 50 cols');
    expect(text).not.toContain('no module');
  });
});

describe('isDataTableStateSnapshot', () => {
  it('accepts a buffer snapshot and rejects unrelated or contradictory objects', () => {
    expect(
      isDataTableStateSnapshot({
        sourceId: 'sales',
        description: 'fixture',
        rowCount: 50,
        columnCount: 1,
        columns: ['rowId'],
      }),
    ).toBe(true);
    expect(
      isDataTableStateSnapshot({
        sourceId: 'sales',
        description: 'fixture',
        rowCount: 50,
        columnCount: 50,
        columns: ['rowId'],
      }),
    ).toBe(false);
    expect(
      isDataTableStateSnapshot({
        sourceId: 'sales',
        description: 'fixture',
        rowCount: Number.NaN,
        columnCount: 1,
        columns: ['rowId'],
      }),
    ).toBe(false);
    expect(isDataTableStateSnapshot({ currentIndex: 0, steps: [] })).toBe(false);
    expect(isDataTableStateSnapshot({})).toBe(false);
    expect(isDataTableStateSnapshot({ sourceId: 'sales' })).toBe(false);
  });
});
