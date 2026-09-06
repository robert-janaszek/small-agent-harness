import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { salesTableSchema, type DataRow, type SalesRow, type SalesTable } from './schemas';

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sales.json');

export type DataTableStateSnapshot = {
  sourceId: string;
  description: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
};

export type DataTableContext = {
  sourceId: string;
  description: string;
  columns: string[];
  rows: DataRow[];
  initialSourceId: string;
  initialDescription: string;
  initialColumns: string[];
  initialRows: DataRow[];
  emit: (event: string, payload?: unknown) => void;
};

export function getFixturePath(): string {
  return FIXTURE_PATH;
}

export function loadSalesFixture(): SalesTable {
  const parsed: unknown = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  return salesTableSchema.parse(parsed);
}

function toDataRows(rows: SalesRow[]): DataRow[] {
  return rows.map((row) => ({ ...row }) as DataRow);
}

function cloneRows(rows: DataRow[]): DataRow[] {
  return structuredClone(rows);
}

export function createContext(): DataTableContext {
  const table = loadSalesFixture();
  const rows = toDataRows(table.rows);
  const columns = [...table.columns];
  return {
    sourceId: table.id,
    description: table.description,
    columns,
    rows,
    initialSourceId: table.id,
    initialDescription: table.description,
    initialColumns: [...columns],
    initialRows: cloneRows(rows),
    emit: () => {},
  };
}

export function resetContext(context: DataTableContext): void {
  context.sourceId = context.initialSourceId;
  context.description = context.initialDescription;
  context.columns = [...context.initialColumns];
  context.rows = cloneRows(context.initialRows);
}

export function snapshotDataTableState(context: DataTableContext): DataTableStateSnapshot {
  return {
    sourceId: context.sourceId,
    description: context.description,
    rowCount: context.rows.length,
    columnCount: context.columns.length,
    columns: [...context.columns],
  };
}

export function createEmptySnapshot(): DataTableStateSnapshot {
  return {
    sourceId: '',
    description: '',
    rowCount: 0,
    columnCount: 0,
    columns: [],
  };
}
