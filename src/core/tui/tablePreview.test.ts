import { describe, expect, it } from 'vitest';

import { EXPORT_PREVIEW_MAX_ROWS, formatTablePreview, parseExportTable } from './tablePreview';

function rowLabel(index: number): string {
  return `R${String(index).padStart(2, '0')}`;
}

describe('parseExportTable', () => {
  it('accepts columns and row objects and rejects malformed payloads', () => {
    expect(
      parseExportTable({
        columns: ['id'],
        rows: [{ id: 1 }],
      }),
    ).toEqual({ columns: ['id'], rows: [{ id: 1 }] });
    expect(parseExportTable({ columns: ['id'] })).toBeNull();
    expect(parseExportTable({ rows: [] })).toBeNull();
    expect(parseExportTable(null)).toBeNull();
  });
});

describe('formatTablePreview', () => {
  it('shows all rows when the table fits and marks truncation at the row cap', () => {
    const small = formatTablePreview(
      {
        columns: ['id', 'name'],
        rows: [
          { id: 1, name: 'alpha' },
          { id: 2, name: 'beta' },
        ],
      },
      80,
    );
    expect(small[0]).toBe('exported 2/2 rows');
    expect(small.join('\n')).toContain('alpha');
    expect(small.join('\n')).toContain('beta');

    const many = Array.from({ length: EXPORT_PREVIEW_MAX_ROWS + 5 }, (_, index) => ({
      id: index + 1,
      name: rowLabel(index + 1),
    }));
    const preview = formatTablePreview({ columns: ['id', 'name'], rows: many }, 80);
    const text = preview.join('\n');

    expect(preview[0]).toBe(`exported ${EXPORT_PREVIEW_MAX_ROWS}/${many.length} rows (truncated)`);
    expect(text).toContain(rowLabel(1));
    expect(text).toContain(rowLabel(EXPORT_PREVIEW_MAX_ROWS));
    expect(text).not.toContain(rowLabel(EXPORT_PREVIEW_MAX_ROWS + 1));
  });

  it('fits as many columns as the width allows and reports truncated cols', () => {
    const columns = ['a', 'b', 'c', 'd', 'e', 'f'];
    const preview = formatTablePreview(
      {
        columns,
        rows: [{ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }],
      },
      48,
    );
    const text = preview.join('\n');

    expect(preview[0]).toMatch(/exported 1\/1 rows, \d+\/6 cols \(truncated\)/);
    expect(text).toMatch(/\+?\d+/);
    expect(text).toContain('… +');
  });

  it('truncates a wide sales header so the preview stays on one row', () => {
    const columns = [
      'rowId',
      'orderId',
      'lineNumber',
      'orderDate',
      'shipDate',
      'customerEmail',
      'customerSegment',
      'industry',
    ];
    const preview = formatTablePreview(
      {
        columns,
        rows: [Object.fromEntries(columns.map((column) => [column, 'x']))],
      },
      40,
    );

    expect(preview[0]).toMatch(/exported 1\/1 rows, \d+\/8 cols \(truncated\)/);
    expect(preview[1]?.length).toBeLessThanOrEqual(40);
    expect(preview[1]).toContain('… +');
    expect(preview.join('\n')).not.toContain('customerSegment');
  });
});
