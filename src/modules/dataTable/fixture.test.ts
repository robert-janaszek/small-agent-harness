import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildSalesTable } from './buildSalesTable';
import { SALES_COLUMN_COUNT, SALES_COLUMNS, SALES_ROW_COUNT } from './columns';
import { createContext, getFixturePath, loadSalesFixture, resetContext } from './context';
import { salesTableSchema } from './schemas';

function moneyEquals(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 2);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

  it('converts the EUR catalog into the row currency instead of reusing the same number', () => {
    const table = buildSalesTable();
    const nimbus = table.rows.filter((row) => row.sku === 'SIT-NM-880');
    const byCurrency = new Map<string, number>();

    expect(nimbus.length).toBeGreaterThan(1);

    for (const row of nimbus) {
      const previous = byCurrency.get(row.currency);
      if (previous === undefined) {
        byCurrency.set(row.currency, row.unitPrice);
      } else {
        expect(row.unitPrice).toBe(previous);
      }
    }

    expect(byCurrency.get('EUR')).toBe(289);
    expect(byCurrency.get('GBP')).toBe(245.65);
    expect(byCurrency.size).toBeGreaterThan(1);
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
      expect(Date.parse(row.updatedAt)).toBeGreaterThan(Date.parse(row.orderDate));

      if (row.isReturned) {
        expect(row.orderStatus).toBe('delivered');
        expect(row.returnReason).toBeTruthy();
        expect(row.paymentStatus).toBe('refunded');
      } else {
        expect(row.returnReason).toBeNull();
      }
    }
  });

  it('stores order shippingCost on line 1 so row sums match per-order sums', () => {
    const table = loadSalesFixture();
    const byOrder = new Map<string, typeof table.rows>();

    for (const row of table.rows) {
      const lines = byOrder.get(row.orderId) ?? [];
      lines.push(row);
      byOrder.set(row.orderId, lines);
    }

    let orderShipping = 0;
    for (const lines of byOrder.values()) {
      const first = lines.find((line) => line.lineNumber === 1);
      expect(first).toBeDefined();
      orderShipping = round2(orderShipping + first!.shippingCost);
      for (const line of lines) {
        if (line.lineNumber !== 1) {
          expect(line.shippingCost).toBe(0);
        }
      }
    }

    const rowSum = round2(table.rows.reduce((sum, row) => sum + row.shippingCost, 0));
    expect(rowSum).toBe(orderShipping);
  });

  it('covers enough groups for later filter and aggregate tools', () => {
    const table = loadSalesFixture();
    const regions = new Set(table.rows.map((row) => row.region));
    const statuses = new Set(table.rows.map((row) => row.orderStatus));
    const quarters = new Set(table.rows.map((row) => row.fiscalQuarter));
    const payments = new Set(table.rows.map((row) => row.paymentStatus));
    const hours = new Set(table.rows.map((row) => row.orderDate.slice(11, 13)));
    const numeric = table.rows.map((row) => row.lineTotal);

    expect(table.rows.some((row) => row.isReturned)).toBe(true);
    expect(new Set(table.rows.filter((row) => row.isReturned).map((row) => row.orderId)).size).toBeGreaterThanOrEqual(
      3,
    );
    expect(regions.size).toBeGreaterThanOrEqual(3);
    expect(hours.size).toBeGreaterThanOrEqual(3);
    expect(statuses.size).toBeGreaterThanOrEqual(3);
    expect(quarters.size).toBeGreaterThan(1);
    expect(payments.size).toBeGreaterThan(1);
    expect(Math.max(...numeric)).toBeGreaterThan(Math.min(...numeric));
  });
});

describe('createContext', () => {
  it('loads a cloned buffer so fixture mutations stay isolated', () => {
    const context = createContext();
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);
    expect(context.columns).toHaveLength(SALES_COLUMN_COUNT);

    const original = Number(context.rows[0]!.lineTotal);
    context.rows[0]!.lineTotal = -1;
    expect(Number(context.initialRows[0]!.lineTotal)).toBe(original);
    expect(loadSalesFixture().rows[0]!.lineTotal).toBe(original);

    resetContext(context);
    expect(Number(context.rows[0]!.lineTotal)).toBe(original);
  });

  it('restores columns and identity on reset', () => {
    const context = createContext();
    const originalColumns = [...context.columns];

    context.columns = ['rowId'];
    context.sourceId = 'mutated';
    context.description = 'mutated';
    context.rows = [];

    resetContext(context);

    expect(context.columns).toEqual(originalColumns);
    expect(context.sourceId).toBe('sales');
    expect(context.description).toBe(loadSalesFixture().description);
    expect(context.rows).toHaveLength(SALES_ROW_COUNT);
  });
});
