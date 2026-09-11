import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { salesTableSchema, type DataRow, type SalesRow, type SalesTable } from './schemas';

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sales.json');

export type BufferWindow = {
  offset: number;
  limit: number;
};

export type DataTableStateSnapshot = {
  sourceId: string;
  description: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  window: BufferWindow | null;
};

export type DataTableContext = {
  sourceId: string;
  description: string;
  columns: string[];
  rows: DataRow[];
  window: BufferWindow | null;
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
    window: null,
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
  context.window = null;
}

export function clearWindow(context: DataTableContext): void {
  context.window = null;
}

export function snapshotDataTableState(context: DataTableContext): DataTableStateSnapshot {
  return {
    sourceId: context.sourceId,
    description: context.description,
    rowCount: context.rows.length,
    columnCount: context.columns.length,
    columns: [...context.columns],
    window: context.window ? { ...context.window } : null,
  };
}

export function createEmptySnapshot(): DataTableStateSnapshot {
  return {
    sourceId: '',
    description: '',
    rowCount: 0,
    columnCount: 0,
    columns: [],
    window: null,
  };
}
