import { describe, expect, it } from 'vitest';

import { renderBufferLines } from './bufferPanel';
import { createEmptySnapshot, type DataTableStateSnapshot } from '../context';

const snapshot: DataTableStateSnapshot = {
  sourceId: 'sales',
  description: 'Synthetic B2B sales line items',
  rowCount: 50,
  columnCount: 50,
  columns: ['rowId', 'orderId', 'lineTotal'],
};

describe('renderBufferLines', () => {
  it('shows a placeholder before the first snapshot', () => {
    const lines = renderBufferLines(createEmptySnapshot(), 6, 30);

    expect(lines).toContain('Waiting for buffer...');
  });

  it('shows buffer size and column names', () => {
    const lines = renderBufferLines(snapshot, 10, 40);

    expect(lines[0]).toBe('Data buffer');
    expect(lines).toContain('sales');
    expect(lines).toContain('50 rows x 50 cols');
    expect(lines.join(' ')).toContain('rowId');
    expect(lines.join(' ')).toContain('orderId');
  });
});
