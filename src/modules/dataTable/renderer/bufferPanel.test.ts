import { describe, expect, it } from 'vitest';

import { formatColumnSummary, renderBufferLines } from './bufferPanel';
import { SALES_COLUMNS, SALES_TABLE_DESCRIPTION } from '../columns';
import { createEmptySnapshot, type DataTableStateSnapshot } from '../context';

const snapshot: DataTableStateSnapshot = {
  sourceId: 'sales',
  description: 'Synthetic B2B sales line items',
  rowCount: 50,
  columnCount: 50,
  columns: ['rowId', 'orderId', 'lineTotal'],
  window: null,
};

describe('renderBufferLines', () => {
  it('shows a placeholder before the first snapshot', () => {
    const lines = renderBufferLines(createEmptySnapshot(), 6, 30);

    expect(lines).toContain('Waiting for buffer...');
  });

  it('shows buffer size and a truncated column list before the description', () => {
    const lines = renderBufferLines(
      { ...snapshot, columns: [...SALES_COLUMNS] },
      10,
      40,
    );

    expect(lines[0]).toBe('Data buffer');
    expect(lines).toContain('sales');
    expect(lines).toContain('50 rows x 50 cols');
    expect(lines.join('\n')).toContain('rowId');
    expect(lines.join('\n')).toMatch(/\(\+\d+\)/);
    expect(lines.join('\n')).not.toContain('updatedAt');
    expect(lines.join('\n')).toContain('Synthetic B2B sales line items');
  });

  it('truncates the table header so size, window, and columns stay visible', () => {
    const lines = renderBufferLines(
      {
        ...snapshot,
        description: SALES_TABLE_DESCRIPTION,
        columns: [...SALES_COLUMNS],
        window: { offset: 1, limit: 5 },
      },
      8,
      39,
    );

    expect(lines).toContain('50 rows x 50 cols');
    expect(lines).toContain('window 1-5');
    expect(lines.some((line) => line.startsWith('Columns:') && line.includes('(+'))).toBe(true);
    expect(lines.join('\n')).not.toContain('group money totals');
    expect(lines.filter((line) => line.startsWith('Synthetic'))).toHaveLength(1);
    expect(lines.every((line) => line.length <= 39)).toBe(true);
  });

  it('shows the send window when one is set', () => {
    const lines = renderBufferLines({ ...snapshot, window: { offset: 6, limit: 5 } }, 12, 40);

    expect(lines).toContain('window 6-10');
  });

  it('clamps the window end to the buffer rowCount', () => {
    const lines = renderBufferLines(
      { ...snapshot, window: { offset: 48, limit: 10 } },
      12,
      40,
    );

    expect(lines).toContain('window 48-50');
    expect(lines.join(' ')).not.toContain('window 48-57');
  });
});

describe('formatColumnSummary', () => {
  it('fits names into the panel width and reports the rest', () => {
    expect(formatColumnSummary(['rowId', 'orderId', 'lineTotal'], 40)).toBe(
      'Columns: rowId, orderId, lineTotal',
    );
    expect(formatColumnSummary(['rowId', 'orderId', 'lineTotal'], 31)).toBe(
      'Columns: rowId, orderId, … (+1)',
    );
    expect(formatColumnSummary([...SALES_COLUMNS], 39)).toMatch(/^Columns: .+… \(\+\d+\)$/);
    expect(formatColumnSummary(['id', 'name'], 40)).toBe('Columns: id, name');
  });
});
