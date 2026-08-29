import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildSalesTable } from './buildSalesTable';
import { SALES_COLUMN_COUNT, SALES_COLUMNS, SALES_ROW_COUNT } from './columns';
import { createContext, getFixturePath, loadSalesFixture, resetContext } from './context';
import { salesTableSchema } from './schemas';

function moneyEquals(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 2);
}

describe('sales fixture', () => {
  it('is a 50 x 50 JSON table that matches the seeded builder', () => {
    const fromDisk = JSON.parse(readFileSync(getFixturePath(), 'utf8')) as unknown;
    const generated = buildSalesTable();

    expect(fromDisk).toEqual(generated);
    expect(salesTableSchema.parse(fromDisk).rows).toHaveLength(SALES_ROW_COUNT);
    expect(generated.columns).toEqual([...SALES_COLUMNS]);
    expect(generated.columns).toHaveLength(SALES_COLUMN_COUNT);
  });

  it('gives every row the same 50 keys and consistent money fields', () => {
    const table = loadSalesFixture();

    for (const [index, row] of table.rows.entries()) {
      expect(Object.keys(row), `row ${index}`).toEqual([...SALES_COLUMNS]);
      expect(row.rowId).toBe(index + 1);

      const expectedNet = Math.round(row.quantity * row.unitPrice * (1 - row.discountPct) * 100) / 100;
      const expectedTax = Math.round(expectedNet * row.taxPct * 100) / 100;
      const expectedTotal = Math.round((expectedNet + expectedTax) * 100) / 100;
      const expectedCost = Math.round(row.quantity * row.unitCost * 100) / 100;

      moneyEquals(row.lineNet, expectedNet);
      moneyEquals(row.lineTax, expectedTax);
      moneyEquals(row.lineTotal, expectedTotal);
      moneyEquals(row.lineCost, expectedCost);

      expect(row.orderDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);

      if (row.isReturned) {
        expect(row.orderStatus).toBe('delivered');
        expect(row.returnReason).toBeTruthy();
      } else {
        expect(row.returnReason).toBeNull();
      }
    }
  });

  it('covers enough groups for later filter and aggregate tools', () => {
    const table = loadSalesFixture();
    const regions = new Set(table.rows.map((row) => row.region));
    const statuses = new Set(table.rows.map((row) => row.orderStatus));
    const hours = new Set(table.rows.map((row) => row.orderDate.slice(11, 13)));
    const numeric = table.rows.map((row) => row.lineTotal);

    expect(regions.size).toBeGreaterThanOrEqual(3);
    expect(hours.size).toBeGreaterThanOrEqual(3);
    expect(statuses.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...numeric)).toBeGreaterThan(Math.min(...numeric));
  });
});

describe('createContext', () => {
  it('loads a cloned buffer so fixture mutations stay isolated', () => {
    const context = createContext();
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);
    expect(context.columns).toHaveLength(SALES_COLUMN_COUNT);

    const original = context.rows[0]!.lineTotal;
    context.rows[0]!.lineTotal = -1;
    expect(context.initialRows[0]!.lineTotal).toBe(original);
    expect(loadSalesFixture().rows[0]!.lineTotal).toBe(original);

    resetContext(context);
    expect(context.rows[0]!.lineTotal).toBe(original);
  });
});
