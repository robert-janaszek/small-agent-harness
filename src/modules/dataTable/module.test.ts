import { describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';

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
