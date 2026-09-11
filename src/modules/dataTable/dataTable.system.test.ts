import { describe, it, expect } from 'vitest';

import { getHarnessConfig, getOpenaiModelsUrl } from '../../core/config';
import { createEventBus } from '../../core/eventBus';
import { Harness, type HarnessRunResult } from '../../core/harness';
import type { CoreEvent } from '../../core/protocol';
import { SALES_COLUMNS, SALES_ROW_COUNT } from './columns';
import { loadSalesFixture } from './context';
import { createDataTableModule, DATA_TABLE_MODULE_ID, type DataTableModule } from './module';
import { aggregateRows, filterRows, limitRows, sortRows } from './query';
import { SEND_SAMPLE_MAX_ROWS, type DataRow } from './schemas';

async function isLlmApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(getOpenaiModelsUrl());
    return response.ok;
  } catch {
    return false;
  }
}

const llmApiAvailable = await isLlmApiAvailable();

const fixtureRows = loadSalesFixture().rows as unknown as DataRow[];
const fixtureColumns = [...SALES_COLUMNS];

const expectedEmea = filterRows(fixtureRows, fixtureColumns, {
  where: [{ column: 'region', op: 'eq', value: 'EMEA' }],
});

const expectedByCurrency = aggregateRows(fixtureRows, fixtureColumns, {
  groupBy: ['currency'],
  metrics: [{ op: 'sum', column: 'lineTotal', as: 'total' }],
});

const expectedTopLineTotals = limitRows(
  sortRows(fixtureRows, fixtureColumns, [{ column: 'lineTotal', direction: 'desc' }]),
  { offset: 1, limit: 5 },
);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function asNumber(value: unknown): number {
  expect(typeof value).toBe('number');
  return value as number;
}

function expectCompletedHarnessRun(result: HarnessRunResult): void {
  const { maxIterations } = getHarnessConfig();

  expect(result.iterations).toBeGreaterThan(0);
  expect(result.iterations).toBeLessThan(maxIterations);
  expect(result.tokenUsage.total_tokens).toBeGreaterThan(0);
}

function toolNames(events: CoreEvent[]): string[] {
  return events
    .filter((event): event is Extract<CoreEvent, { type: 'tool_call' }> => event.type === 'tool_call')
    .map((event) => event.name);
}

function exportPayload(events: CoreEvent[]): { columns: string[]; rows: DataRow[] } {
  const exported = events.find(
    (event): event is Extract<CoreEvent, { type: 'module' }> =>
      event.type === 'module' && event.module === DATA_TABLE_MODULE_ID && event.event === 'export',
  );
  expect(exported).toBeDefined();
  const payload = exported?.payload as { columns?: unknown; rows?: unknown };
  expect(Array.isArray(payload.columns)).toBe(true);
  expect(Array.isArray(payload.rows)).toBe(true);
  return { columns: payload.columns as string[], rows: payload.rows as DataRow[] };
}

function sumColumn(row: DataRow): number {
  const preferred = ['total', 'sum_lineTotal', 'lineTotal'];
  for (const name of preferred) {
    if (typeof row[name] === 'number') {
      return row[name];
    }
  }

  const numeric = Object.entries(row).find(
    ([column, value]) => column !== 'currency' && typeof value === 'number',
  );
  expect(numeric).toBeDefined();
  return asNumber(numeric?.[1]);
}

describe.skipIf(!llmApiAvailable)('dataTable system', () => {
  it('filters the buffer to EMEA rows', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const module = createDataTableModule();
    const harness = new Harness({ modules: [module], bus });
    harness.startSession();

    const result = await harness.run('Keep only EMEA rows in the buffer.');

    expectCompletedHarnessRun(result);
    expect(toolNames(events)).toContain('filterRows');
    expect(module.context.rows).toHaveLength(expectedEmea.length);
    expect(module.context.rows.length).toBeGreaterThan(0);
    expect(module.context.rows.length).toBeLessThan(SALES_ROW_COUNT);
    expect(module.context.rows.every((row) => row.region === 'EMEA')).toBe(true);
  });

  it('replaces the buffer with lineTotal sums grouped by currency', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const module = createDataTableModule();
    const harness = new Harness({ modules: [module], bus });
    harness.startSession();

    const result = await harness.run(
      'Replace the buffer with the sum of lineTotal grouped by currency. Do not filter first. Do not sum across currencies.',
    );

    expectCompletedHarnessRun(result);
    expect(toolNames(events)).toContain('aggregate');
    expect(module.context.columns).toContain('currency');
    expect(module.context.rows).toHaveLength(expectedByCurrency.rows.length);

    const expectedTotals = new Map(
      expectedByCurrency.rows.map((row) => [String(row.currency), round2(asNumber(row.total))]),
    );
    expect(expectedTotals.size).toBeGreaterThan(1);

    for (const row of module.context.rows) {
      const currency = String(row.currency);
      expect(expectedTotals.has(currency)).toBe(true);
      expect(round2(sumColumn(row))).toBe(expectedTotals.get(currency));
    }
  });

  it('windows the five highest lineTotal rows without truncating the buffer', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const module = createDataTableModule();
    const harness = new Harness({ modules: [module], bus });
    harness.startSession();

    const result = await harness.run(
      'Show the 5 rows with the highest lineTotal. Sort, then set a limitRows window of 5, then sendBufferToUser. Do not drop the other rows. Do not use previewRows for this.',
    );

    expectCompletedHarnessRun(result);
    expect(toolNames(events)).toContain('sortRows');
    expect(toolNames(events)).toContain('limitRows');
    expect(module.context.rows).toHaveLength(SALES_ROW_COUNT);
    expect(module.context.window).toMatchObject({ limit: 5 });

    const window = module.context.window;
    expect(window).not.toBeNull();
    const windowRows = limitRows(module.context.rows, window!);
    expect(windowRows).toHaveLength(5);

    const actualTotals = windowRows.map((row) => round2(asNumber(row.lineTotal)));
    const expectedTotals = expectedTopLineTotals.map((row) => round2(asNumber(row.lineTotal)));
    expect([...actualTotals].sort((left, right) => right - left)).toEqual(expectedTotals);
  });

  it('sends the full buffer to the user and returns a short sample in the tool result', async () => {
    const events: CoreEvent[] = [];
    const bus = createEventBus();
    bus.subscribe((event) => events.push(event));
    const module = createDataTableModule();
    const harness = new Harness({ modules: [module], bus });
    harness.startSession();

    const result = await harness.run(
      'Send the full current buffer to the user. Do not print or quote the rows yourself.',
    );

    expectCompletedHarnessRun(result);
    expect(toolNames(events)).toContain('sendBufferToUser');
    expect(module.context.rows).toHaveLength(SALES_ROW_COUNT);
    expect(module.context.columns).toEqual([...SALES_COLUMNS]);

    const payload = exportPayload(events);
    expect(payload.columns).toEqual([...SALES_COLUMNS]);
    expect(payload.rows).toHaveLength(SALES_ROW_COUNT);
    expect(JSON.stringify(payload.rows)).toContain('Northwind Logistics');

    const toolResult = events.find(
      (event): event is Extract<CoreEvent, { type: 'tool_result' }> =>
        event.type === 'tool_result' && event.name === 'sendBufferToUser',
    );
    expect(toolResult?.content).toContain('"sent":true');
    expect(toolResult?.content).toContain(`all ${SALES_ROW_COUNT} rows were sent to the user`);
    const toolPayload = JSON.parse(toolResult?.content ?? '{}') as {
      sample?: unknown[];
      omitted?: number;
    };
    expect(toolPayload.sample).toHaveLength(SEND_SAMPLE_MAX_ROWS);
    expect(toolPayload.omitted).toBe(SALES_ROW_COUNT - SEND_SAMPLE_MAX_ROWS);
  });
});
