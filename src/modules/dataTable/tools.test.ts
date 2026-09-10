import { describe, expect, it } from 'vitest';

import { formatToolActivity, indexToolActivity } from '../../core/tui/toolActivity';
import { SALES_COLUMN_COUNT, SALES_COLUMNS, SALES_ROW_COUNT } from './columns';
import { createContext } from './context';
import { describeTableTool } from './describeTable.tool';
import { filterRowsTool } from './filterRows.tool';
import { aggregateTool } from './aggregate.tool';
import { createDataTableModule } from './module';
import { PREVIEW_MAX_LIMIT } from './schemas';
import { previewRowsTool } from './previewRows.tool';
import { resetBufferTool } from './resetBuffer.tool';
import { selectColumnsTool } from './selectColumns.tool';
import { SEND_BUFFER_AFTER_MUTATION, sendBufferToUserTool } from './sendBufferToUser.tool';
import { sortRowsTool } from './sortRows.tool';

function parseJson(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

describe('dataTable tools', () => {
  it('describeTable returns column stats without row payloads', async () => {
    const context = createContext();
    const tool = describeTableTool(context);
    const result = parseJson(await tool.call({}));

    expect(result.rowCount).toBe(SALES_ROW_COUNT);
    expect(result.columnCount).toBe(SALES_COLUMN_COUNT);
    expect(result.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'region', type: 'string' }),
        expect.objectContaining({ name: 'lineTotal', type: 'number' }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('Northwind Logistics');

    const values = parseJson(await tool.call({ column: 'region' }));
    expect(values.values).toMatchObject({ column: 'region', truncated: false });
    expect((values.values as { values: unknown[] }).values).toEqual(
      expect.arrayContaining(['EMEA', 'AMER', 'APAC']),
    );
  });

  it('filterRows mutates the buffer and reports dropped rows', async () => {
    const context = createContext();
    const tool = filterRowsTool(context);
    const before = context.rows.length;
    const result = parseJson(
      await tool.call({
        where: [{ column: 'region', op: 'eq', value: 'EMEA' }],
      }),
    );

    expect(context.rows.length).toBe(result.rowCount);
    expect(result.dropped).toBe(before - context.rows.length);
    expect(context.rows.length).toBeGreaterThan(0);
    expect(context.rows.length).toBeLessThan(SALES_ROW_COUNT);
    expect(context.rows.every((row) => row.region === 'EMEA')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('orderId');
    expect(result.next).toBe(SEND_BUFFER_AFTER_MUTATION);
  });

  it('sortRows orders the buffer and keeps the same length', async () => {
    const context = createContext();
    const tool = sortRowsTool(context);
    const result = parseJson(
      await tool.call({
        keys: [{ column: 'lineTotal', direction: 'desc' }],
      }),
    );

    expect(result.rowCount).toBe(SALES_ROW_COUNT);
    expect(result.next).toBe(SEND_BUFFER_AFTER_MUTATION);
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);
    const totals = context.rows.map((row) => Number(row.lineTotal));
    const sorted = [...totals].sort((left, right) => right - left);
    expect(totals).toEqual(sorted);
  });

  it('aggregate replaces the buffer with the grouped table', async () => {
    const context = createContext();
    const tool = aggregateTool(context);
    const result = parseJson(
      await tool.call({
        groupBy: ['currency'],
        metrics: [{ op: 'count' }, { op: 'sum', column: 'lineTotal', as: 'total' }],
      }),
    );

    expect(result.warnings).toEqual([]);
    expect(result.next).toBe(SEND_BUFFER_AFTER_MUTATION);
    expect(result.columns).toEqual(['currency', 'count', 'total']);
    expect(context.columns).toEqual(['currency', 'count', 'total']);
    expect(context.rows).toHaveLength(result.rowCount as number);
    expect((result.rows as unknown[]).length).toBe(context.rows.length);
    expect(context.rows.length).toBeGreaterThan(1);
    expect(context.rows.length).toBeLessThan(SALES_ROW_COUNT);
  });

  it('previewRows caps the page and can project columns without mutating', async () => {
    const context = createContext();
    const columnsBefore = [...context.columns];
    const tool = previewRowsTool(context);
    const result = parseJson(
      await tool.call({
        offset: 1,
        limit: PREVIEW_MAX_LIMIT,
        columns: ['orderId', 'lineTotal'],
      }),
    );

    expect(result.rowCount).toBe(SALES_ROW_COUNT);
    expect(result.hasMore).toBe(true);
    expect(result.columns).toEqual(['orderId', 'lineTotal']);
    expect(result.rows).toHaveLength(PREVIEW_MAX_LIMIT);
    expect(context.columns).toEqual(columnsBefore);
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);
  });

  it('fails preview past the end and unknown columns without mutating', async () => {
    const context = createContext();
    const preview = previewRowsTool(context);
    const filter = filterRowsTool(context);

    const pastEnd = await preview.execute({ offset: SALES_ROW_COUNT + 1, limit: 1 });
    expect(pastEnd.failed).toBe(true);
    expect(pastEnd.content).toContain('past the end of the buffer');

    const unknown = await filter.execute({
      where: [{ column: 'notAColumn', op: 'eq', value: 'x' }],
    });
    expect(unknown.failed).toBe(true);
    expect(unknown.content).toContain('Unknown column "notAColumn"');
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);
    expect(context.columns).toEqual([...SALES_COLUMNS]);
  });

  it('runs filter then aggregate then preview, and resetBuffer restores the fixture', async () => {
    const context = createContext();
    const filter = filterRowsTool(context);
    const aggregate = aggregateTool(context);
    const preview = previewRowsTool(context);
    const reset = resetBufferTool(context);

    await filter.call({
      where: [{ column: 'region', op: 'eq', value: 'EMEA' }],
    });
    const grouped = parseJson(
      await aggregate.call({
        groupBy: ['currency'],
        metrics: [{ op: 'sum', column: 'lineTotal', as: 'total' }],
      }),
    );
    const page = parseJson(
      await preview.call({
        offset: 1,
        limit: Math.min(PREVIEW_MAX_LIMIT, context.rows.length),
      }),
    );

    expect(grouped.rows).toEqual(page.rows);
    expect(context.columns).toEqual(['currency', 'total']);

    const restored = parseJson(await reset.call({}));
    expect(restored).toEqual({ rowCount: SALES_ROW_COUNT, columnCount: SALES_COLUMN_COUNT });
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);
    expect(context.columns).toEqual([...SALES_COLUMNS]);
  });

  it('selectColumns mutates the schema and resetBuffer restores the fixture', async () => {
    const context = createContext();
    const select = selectColumnsTool(context);
    const reset = resetBufferTool(context);
    const result = parseJson(
      await select.call({
        columns: ['orderId', 'lineTotal', 'currency'],
      }),
    );

    expect(result).toEqual({
      rowCount: SALES_ROW_COUNT,
      columnCount: 3,
      columns: ['orderId', 'lineTotal', 'currency'],
      next: SEND_BUFFER_AFTER_MUTATION,
    });
    expect(JSON.stringify(result)).not.toContain('Northwind Logistics');
    expect(context.columns).toEqual(['orderId', 'lineTotal', 'currency']);
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);
    expect(Object.keys(context.rows[0] ?? {})).toEqual(['orderId', 'lineTotal', 'currency']);

    const restored = parseJson(await reset.call({}));
    expect(restored).toEqual({ rowCount: SALES_ROW_COUNT, columnCount: SALES_COLUMN_COUNT });
    expect(context.columns).toEqual([...SALES_COLUMNS]);
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);
  });

  it('sendBufferToUser emits the full buffer and omits cells from the tool result', async () => {
    const context = createContext();
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    context.emit = (event, payload) => {
      emitted.push({ event, payload });
    };

    const result = parseJson(await sendBufferToUserTool(context).call({}));
    expect(result).toMatchObject({
      sent: true,
      rowCount: SALES_ROW_COUNT,
      columnCount: SALES_COLUMN_COUNT,
      message: 'do not reprint these rows',
    });
    expect(JSON.stringify(result)).not.toContain('Northwind Logistics');
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.event).toBe('export');
    const payload = emitted[0]?.payload as { rows: unknown[]; columns: string[] };
    expect(payload.columns).toEqual([...SALES_COLUMNS]);
    expect(payload.rows).toHaveLength(SALES_ROW_COUNT);
    expect(JSON.stringify(payload.rows)).toContain('Northwind Logistics');
  });

  it('rounds exported numbers to two decimals without mutating the buffer', async () => {
    const context = createContext();
    context.columns = ['amount', 'label'];
    context.rows = [{ amount: 10.126, label: 'keep' }];
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    context.emit = (event, payload) => {
      emitted.push({ event, payload });
    };

    await sendBufferToUserTool(context).call({});

    expect(context.rows[0]?.amount).toBe(10.126);
    const payload = emitted[0]?.payload as { rows: Array<{ amount: number; label: string }> };
    expect(payload.rows).toEqual([{ amount: 10.13, label: 'keep' }]);
  });
});

describe('dataTable tool activity', () => {
  const activities = indexToolActivity(createDataTableModule().tools ?? []);

  function format(name: string, args: unknown, status: 'running' | 'done' | 'failed'): string {
    return formatToolActivity(name, args, status, activities.get(name));
  }

  it.each([
    ['describeTable', {}, 'describing columns', 'described columns'],
    ['describeTable', { column: 'region' }, 'describing "region"', 'described "region"'],
    [
      'filterRows',
      { where: [{ column: 'region', op: 'eq', value: 'EMEA' }] },
      'filtering 1 clause',
      'filtered 1 clause',
    ],
    [
      'selectColumns',
      { columns: ['orderId', 'currency'] },
      'selecting "orderId, currency"',
      'selected "orderId, currency"',
    ],
    [
      'sortRows',
      { keys: [{ column: 'lineTotal', direction: 'desc' }] },
      'sorting "lineTotal"',
      'sorted "lineTotal"',
    ],
    [
      'aggregate',
      { groupBy: ['currency'], metrics: [{ op: 'count' }] },
      'aggregating currency',
      'aggregated currency',
    ],
    ['aggregate', { metrics: [{ op: 'count' }] }, 'aggregating totals', 'aggregated totals'],
    ['previewRows', { offset: 1, limit: 10 }, 'previewing rows 1-10', 'previewed rows 1-10'],
    ['sendBufferToUser', {}, 'sending buffer', 'sent buffer'],
    ['resetBuffer', {}, 'resetting buffer', 'reset buffer'],
  ] as const)('%s present/past', (name, args, running, done) => {
    expect(format(name, args, 'running')).toBe(running);
    expect(format(name, args, 'done')).toBe(done);
  });
});
