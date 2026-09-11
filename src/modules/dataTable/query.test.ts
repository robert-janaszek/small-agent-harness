import { describe, expect, it } from 'vitest';

import { SALES_COLUMNS, SALES_ROW_COUNT } from './columns';
import { loadSalesFixture } from './context';
import {
  QueryError,
  aggregateRows,
  describeTable,
  filterRows,
  limitRows,
  previewRows,
  resolveLimitWindow,
  roundExportRows,
  sampleSentRows,
  selectColumns,
  sortRows,
} from './query';
import { DISTINCT_VALUES_CAP, SEND_SAMPLE_MAX_ROWS, type DataRow } from './schemas';

const COLUMNS = ['name', 'region', 'amount', 'note', 'currency'] as const;

const ROWS: DataRow[] = [
  { name: 'alpha', region: 'EMEA', amount: 10, note: 'first', currency: 'EUR' },
  { name: 'beta', region: 'AMER', amount: 30, note: null, currency: 'USD' },
  { name: 'gamma', region: 'EMEA', amount: 20, note: 'second', currency: 'EUR' },
  { name: 'delta', region: 'APAC', amount: null, note: 'third', currency: 'JPY' },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function asNumber(value: unknown): number {
  expect(typeof value).toBe('number');
  return value as number;
}

describe('describeTable', () => {
  it('reports type, nulls, distinct counts, and numeric min/max', () => {
    const result = describeTable(ROWS, [...COLUMNS]);

    expect(result.rowCount).toBe(4);
    expect(result.columnCount).toBe(5);
    expect(result.columns).toEqual(
      expect.arrayContaining([
        { name: 'region', type: 'string', nullCount: 0, distinctCount: 3 },
        { name: 'amount', type: 'number', nullCount: 1, distinctCount: 4, min: 10, max: 30 },
        { name: 'note', type: 'string', nullCount: 1, distinctCount: 4 },
      ]),
    );
    expect(result.values).toBeUndefined();
  });

  it('lists distinct values for one column and truncates past the cap', () => {
    const many = Array.from({ length: DISTINCT_VALUES_CAP + 3 }, (_, index) => ({
      id: index + 1,
    }));
    const result = describeTable(many, ['id'], 'id');

    expect(result.values).toEqual({
      column: 'id',
      values: Array.from({ length: DISTINCT_VALUES_CAP }, (_, index) => index + 1),
      truncated: true,
    });
  });

  it('rejects an unknown column', () => {
    expect(() => describeTable(ROWS, [...COLUMNS], 'missing')).toThrow(QueryError);
    expect(() => describeTable(ROWS, [...COLUMNS], 'missing')).toThrow('Unknown column "missing"');
  });
});

describe('filterRows', () => {
  it('ANDs clauses by default and ORs when match is any', () => {
    const emea = filterRows(ROWS, [...COLUMNS], {
      where: [{ column: 'region', op: 'eq', value: 'EMEA' }],
    });
    expect(emea.map((row) => row.name)).toEqual(['alpha', 'gamma']);

    const either = filterRows(ROWS, [...COLUMNS], {
      match: 'any',
      where: [
        { column: 'region', op: 'eq', value: 'AMER' },
        { column: 'amount', op: 'lt', value: 15 },
      ],
    });
    expect(either.map((row) => row.name)).toEqual(['alpha', 'beta']);
  });

  it('supports contains, in, isNull, and inequality without coercing types', () => {
    expect(
      filterRows(ROWS, [...COLUMNS], {
        where: [{ column: 'note', op: 'contains', value: 'ir' }],
      }).map((row) => row.name),
    ).toEqual(['alpha', 'delta']);

    expect(
      filterRows(ROWS, [...COLUMNS], {
        where: [{ column: 'region', op: 'in', value: ['AMER', 'APAC'] }],
      }).map((row) => row.name),
    ).toEqual(['beta', 'delta']);

    expect(
      filterRows(ROWS, [...COLUMNS], {
        where: [{ column: 'note', op: 'isNull' }],
      }).map((row) => row.name),
    ).toEqual(['beta']);

    expect(
      filterRows(ROWS, [...COLUMNS], {
        where: [{ column: 'amount', op: 'eq', value: '10' }],
      }),
    ).toEqual([]);
  });

  it('compares ISO dates lexicographically', () => {
    const dated: DataRow[] = [
      { at: '2024-01-01T00:00:00.000Z' },
      { at: '2024-06-15T12:00:00.000Z' },
      { at: '2025-01-01T00:00:00.000Z' },
    ];
    const filtered = filterRows(dated, ['at'], {
      where: [{ column: 'at', op: 'gte', value: '2024-06-15T12:00:00.000Z' }],
    });
    expect(filtered.map((row) => row.at)).toEqual(['2024-06-15T12:00:00.000Z', '2025-01-01T00:00:00.000Z']);
  });
});

describe('sortRows', () => {
  it('sorts by keys and keeps nulls last in both directions', () => {
    const asc = sortRows(ROWS, [...COLUMNS], [{ column: 'amount', direction: 'asc' }]);
    expect(asc.map((row) => row.amount)).toEqual([10, 20, 30, null]);

    const desc = sortRows(ROWS, [...COLUMNS], [{ column: 'amount', direction: 'desc' }]);
    expect(desc.map((row) => row.amount)).toEqual([30, 20, 10, null]);
  });
});

describe('aggregateRows', () => {
  it('groups, counts, and sums with default aliases', () => {
    const result = aggregateRows(ROWS, [...COLUMNS], {
      groupBy: ['region'],
      metrics: [{ op: 'count' }, { op: 'sum', column: 'amount' }, { op: 'max', column: 'amount', as: 'peak' }],
    });

    expect(result.columns).toEqual(['region', 'count', 'sum_amount', 'peak']);
    expect(result.warnings).toEqual([]);
    const emea = result.rows.find((row) => row.region === 'EMEA');
    expect(emea).toMatchObject({ region: 'EMEA', count: 2, peak: 20 });
    expect(asNumber(emea?.sum_amount)).toBe(30);
  });

  it('returns one grand-total row when groupBy is empty', () => {
    const result = aggregateRows(ROWS, [...COLUMNS], {
      metrics: [{ op: 'count' }, { op: 'avg', column: 'amount' }],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ count: 4 });
    expect(asNumber(result.rows[0]?.avg_amount)).toBeCloseTo(20);
  });

  it('warns when summing money without grouping by currency and still computes', () => {
    const result = aggregateRows(ROWS, [...COLUMNS], {
      metrics: [{ op: 'sum', column: 'amount' }],
    });
    expect(result.warnings).toEqual([]);

    const moneyRows: DataRow[] = [
      { currency: 'EUR', lineTotal: 10 },
      { currency: 'USD', lineTotal: 20 },
    ];
    const naive = aggregateRows(moneyRows, ['currency', 'lineTotal'], {
      metrics: [{ op: 'sum', column: 'lineTotal' }],
    });
    expect(naive.warnings).toEqual(['lineTotal mixes currencies; group by currency']);
    expect(asNumber(naive.rows[0]?.sum_lineTotal)).toBe(30);

    const grouped = aggregateRows(moneyRows, ['currency', 'lineTotal'], {
      groupBy: ['currency'],
      metrics: [{ op: 'sum', column: 'lineTotal' }],
    });
    expect(grouped.warnings).toEqual([]);
  });

  it('fails on a non-numeric sum column', () => {
    expect(() =>
      aggregateRows(ROWS, [...COLUMNS], {
        metrics: [{ op: 'sum', column: 'region' }],
      }),
    ).toThrow('Cannot sum non-numeric column "region"');
  });
});

describe('roundExportRows', () => {
  it('rounds finite numbers to two decimal places and leaves other cells alone', () => {
    const rounded = roundExportRows([
      { name: 'alpha', amount: 10.126, ratio: 1 / 3, count: 4, note: null },
    ]);
    expect(rounded).toEqual([{ name: 'alpha', amount: 10.13, ratio: 0.33, count: 4, note: null }]);
  });
});

describe('sampleSentRows', () => {
  it('returns the first rows and how many were omitted', () => {
    const many = Array.from({ length: SEND_SAMPLE_MAX_ROWS + 2 }, (_, index) => ({ id: index + 1 }));
    expect(sampleSentRows(many, ['id'])).toEqual({
      sample: many.slice(0, SEND_SAMPLE_MAX_ROWS),
      omitted: 2,
      sampleColumns: ['id'],
      omittedColumns: 0,
    });
    expect(sampleSentRows(ROWS, [...COLUMNS])).toEqual({
      sample: ROWS,
      omitted: 0,
      sampleColumns: [...COLUMNS],
      omittedColumns: 0,
    });
  });

  it('projects sample columns when maxColumns is below the schema width', () => {
    const result = sampleSentRows(ROWS, [...COLUMNS], { maxColumns: 2 });
    expect(result.sampleColumns).toEqual(['name', 'region']);
    expect(result.omittedColumns).toBe(COLUMNS.length - 2);
    expect(result.sample).toEqual([
      { name: 'alpha', region: 'EMEA' },
      { name: 'beta', region: 'AMER' },
      { name: 'gamma', region: 'EMEA' },
      { name: 'delta', region: 'APAC' },
    ]);
  });
});

describe('selectColumns', () => {
  it('projects columns in the requested order', () => {
    const result = selectColumns(ROWS, [...COLUMNS], ['amount', 'name']);
    expect(result.columns).toEqual(['amount', 'name']);
    expect(result.rows).toEqual([
      { amount: 10, name: 'alpha' },
      { amount: 30, name: 'beta' },
      { amount: 20, name: 'gamma' },
      { amount: null, name: 'delta' },
    ]);
  });

  it('rejects unknown and duplicate columns', () => {
    expect(() => selectColumns(ROWS, [...COLUMNS], ['missing'])).toThrow('Unknown column "missing"');
    expect(() => selectColumns(ROWS, [...COLUMNS], ['name', 'name'])).toThrow('Duplicate column "name"');
  });
});

describe('previewRows', () => {
  it('returns a 1-based page and optional projection', () => {
    const page = previewRows(ROWS, [...COLUMNS], { offset: 2, limit: 2, columns: ['name', 'amount'] });
    expect(page).toEqual({
      rowCount: 4,
      offset: 2,
      limit: 2,
      hasMore: true,
      columns: ['name', 'amount'],
      rows: [
        { name: 'beta', amount: 30 },
        { name: 'gamma', amount: 20 },
      ],
    });
  });

  it('returns an empty page for an empty buffer and rejects an offset past the end', () => {
    expect(previewRows([], [...COLUMNS], { offset: 1, limit: 10 })).toMatchObject({
      rowCount: 0,
      hasMore: false,
      rows: [],
    });
    expect(() => previewRows(ROWS, [...COLUMNS], { offset: 5, limit: 1 })).toThrow(
      'offset 5 is past the end of the buffer (4 rows).',
    );
  });
});

describe('limitRows', () => {
  it('keeps a 1-based slice', () => {
    expect(limitRows(ROWS, { offset: 1, limit: 2 }).map((row) => row.name)).toEqual(['alpha', 'beta']);
    expect(limitRows(ROWS, { offset: 2, limit: 2 }).map((row) => row.name)).toEqual(['beta', 'gamma']);
  });

  it('keeps the remainder when limit overruns the buffer', () => {
    expect(limitRows(ROWS, { offset: 3, limit: 10 }).map((row) => row.name)).toEqual(['gamma', 'delta']);
  });

  it('returns an empty list for an empty buffer and rejects an offset past the end', () => {
    expect(limitRows([], { offset: 1, limit: 3 })).toEqual([]);
    expect(() => limitRows([], { offset: 2, limit: 1 })).toThrow(
      'offset 2 is past the end of the buffer (0 rows).',
    );
    expect(() => limitRows(ROWS, { offset: 5, limit: 1 })).toThrow(
      'offset 5 is past the end of the buffer (4 rows).',
    );
  });
});

describe('resolveLimitWindow', () => {
  it('defaults offset to 1 and advances from the current window', () => {
    expect(resolveLimitWindow(null, { limit: 5 })).toEqual({ offset: 1, limit: 5 });
    expect(resolveLimitWindow({ offset: 1, limit: 5 }, { next: true })).toEqual({
      offset: 6,
      limit: 5,
    });
    expect(resolveLimitWindow({ offset: 1, limit: 5 }, { next: true, limit: 3 })).toEqual({
      offset: 6,
      limit: 3,
    });
  });

  it('rejects next without a window', () => {
    expect(() => resolveLimitWindow(null, { next: true })).toThrow('No window to advance');
  });
});

describe('sales fixture queries', () => {
  const table = loadSalesFixture();
  const rows = table.rows as unknown as DataRow[];
  const columns = [...SALES_COLUMNS];

  it('filters EMEA without inventing rows', () => {
    const expected = table.rows.filter((row) => row.region === 'EMEA');
    const filtered = filterRows(rows, columns, {
      where: [{ column: 'region', op: 'eq', value: 'EMEA' }],
    });
    expect(filtered).toHaveLength(expected.length);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(SALES_ROW_COUNT);
    expect(filtered.every((row) => row.region === 'EMEA')).toBe(true);
  });

  it('sums lineTotal per currency and warns when currency is omitted', () => {
    const grouped = aggregateRows(rows, columns, {
      groupBy: ['currency'],
      metrics: [{ op: 'sum', column: 'lineTotal', as: 'total' }],
    });
    expect(grouped.warnings).toEqual([]);

    const totals = new Map<string, number>();
    for (const row of table.rows) {
      totals.set(row.currency, round2((totals.get(row.currency) ?? 0) + row.lineTotal));
    }
    expect(grouped.rows).toHaveLength(totals.size);
    for (const row of grouped.rows) {
      expect(round2(asNumber(row.total))).toBe(totals.get(String(row.currency)));
    }

    const naive = aggregateRows(rows, columns, {
      metrics: [{ op: 'sum', column: 'lineTotal' }],
    });
    expect(naive.warnings).toEqual(['lineTotal mixes currencies; group by currency']);
  });

  it('sums shippingCost once per order', () => {
    const result = aggregateRows(rows, columns, {
      metrics: [{ op: 'sum', column: 'shippingCost' }],
    });
    const expected = round2(table.rows.reduce((sum, row) => sum + row.shippingCost, 0));
    expect(round2(asNumber(result.rows[0]?.sum_shippingCost))).toBe(expected);
  });

  it('takes the top lineTotals after a descending sort', () => {
    const ranked = sortRows(rows, columns, [{ column: 'lineTotal', direction: 'desc' }]);
    const top = limitRows(ranked, { offset: 1, limit: 5 });
    expect(top).toHaveLength(5);
    const totals = top.map((row) => asNumber(row.lineTotal));
    expect(totals).toEqual([...totals].sort((left, right) => right - left));
    expect(asNumber(top[0]?.lineTotal)).toBe(asNumber(ranked[0]?.lineTotal));
  });
});
