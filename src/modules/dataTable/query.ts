import {
  DISTINCT_VALUES_CAP,
  type AggregateArgs,
  type AggregateMetric,
  type CellValue,
  type DataRow,
  type FilterClause,
  type FilterRowsArgs,
  type LimitRowsArgs,
  type PreviewRowsArgs,
  type SortKey,
} from './schemas';

export type BufferWindowSpec = {
  offset: number;
  limit: number;
};

export const MONEY_COLUMNS = new Set([
  'lineTotal',
  'lineNet',
  'unitPrice',
  'lineTax',
  'unitCost',
  'lineCost',
  'shippingCost',
]);

export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

export type ColumnType = 'string' | 'number' | 'boolean' | 'null';

export type ColumnStats = {
  name: string;
  type: ColumnType;
  nullCount: number;
  distinctCount: number;
  min?: number;
  max?: number;
};

export type DescribeTableResult = {
  rowCount: number;
  columnCount: number;
  columns: ColumnStats[];
  values?: { column: string; values: CellValue[]; truncated: boolean };
};

export type AggregateResult = {
  columns: string[];
  rows: DataRow[];
  warnings: string[];
};

export type PreviewResult = {
  rowCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  columns: string[];
  rows: DataRow[];
};

export function requireColumn(columns: string[], name: string): string {
  if (!columns.includes(name)) {
    throw new QueryError(`Unknown column "${name}". Known columns: ${columns.join(', ')}`);
  }
  return name;
}

export function getCell(row: DataRow, column: string): CellValue {
  return Object.prototype.hasOwnProperty.call(row, column) ? (row[column] as CellValue) : null;
}

export function describeTable(rows: DataRow[], columns: string[], column?: string): DescribeTableResult {
  const stats = columns.map((name) => describeColumn(rows, name));
  const result: DescribeTableResult = {
    rowCount: rows.length,
    columnCount: columns.length,
    columns: stats,
  };

  if (column !== undefined) {
    requireColumn(columns, column);
    const unique: CellValue[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const cell = getCell(row, column);
      const key = cellKey(cell);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(cell);
    }
    result.values = {
      column,
      values: unique.slice(0, DISTINCT_VALUES_CAP),
      truncated: unique.length > DISTINCT_VALUES_CAP,
    };
  }

  return result;
}

export function filterRows(rows: DataRow[], columns: string[], spec: FilterRowsArgs): DataRow[] {
  for (const clause of spec.where) {
    requireColumn(columns, clause.column);
  }

  const match = spec.match ?? 'all';
  return rows.filter((row) => {
    if (match === 'any') {
      return spec.where.some((clause) => matchesClause(row, clause));
    }
    return spec.where.every((clause) => matchesClause(row, clause));
  });
}

export function sortRows(rows: DataRow[], columns: string[], keys: SortKey[]): DataRow[] {
  for (const key of keys) {
    requireColumn(columns, key.column);
  }

  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const comparison = compareSortCells(
        getCell(left, key.column),
        getCell(right, key.column),
        key.direction === 'desc' ? 'desc' : 'asc',
      );
      if (comparison !== 0) {
        return comparison;
      }
    }
    return 0;
  });
}

export function metricAlias(metric: AggregateMetric): string {
  if (metric.as) {
    return metric.as;
  }
  if (metric.op === 'count' && !metric.column) {
    return 'count';
  }
  if (!metric.column) {
    return metric.op;
  }
  return `${metric.op}_${metric.column}`;
}

export function aggregateRows(rows: DataRow[], columns: string[], spec: AggregateArgs): AggregateResult {
  const groupBy = spec.groupBy ?? [];
  for (const column of groupBy) {
    requireColumn(columns, column);
  }

  const resultColumns = [...groupBy];
  const aliases = new Set<string>(groupBy);

  for (const metric of spec.metrics) {
    if (metric.op !== 'count' && !metric.column) {
      throw new QueryError(`${metric.op} requires a column`);
    }
    if (metric.column) {
      requireColumn(columns, metric.column);
    }
    const alias = metricAlias(metric);
    if (aliases.has(alias)) {
      throw new QueryError(`Duplicate result column "${alias}"`);
    }
    aliases.add(alias);
    resultColumns.push(alias);
  }

  const warnings = moneyWarnings(groupBy, spec.metrics);

  const groups = new Map<string, DataRow[]>();
  if (groupBy.length === 0) {
    groups.set('', rows);
  } else {
    for (const row of rows) {
      const key = JSON.stringify(groupBy.map((column) => getCell(row, column)));
      const group = groups.get(key);
      if (group) {
        group.push(row);
      } else {
        groups.set(key, [row]);
      }
    }
  }

  const resultRows: DataRow[] = [];
  for (const groupRows of groups.values()) {
    const result: DataRow = {};
    const sample = groupRows[0];
    for (const column of groupBy) {
      result[column] = sample ? getCell(sample, column) : null;
    }
    for (const metric of spec.metrics) {
      result[metricAlias(metric)] = computeMetric(groupRows, metric);
    }
    resultRows.push(result);
  }

  return { columns: resultColumns, rows: resultRows, warnings };
}

export function selectColumns(
  rows: DataRow[],
  columns: string[],
  selected: string[],
): { columns: string[]; rows: DataRow[] } {
  if (selected.length === 0) {
    throw new QueryError('selectColumns requires at least one column');
  }

  const seen = new Set<string>();
  for (const name of selected) {
    requireColumn(columns, name);
    if (seen.has(name)) {
      throw new QueryError(`Duplicate column "${name}"`);
    }
    seen.add(name);
  }

  return {
    columns: [...selected],
    rows: rows.map((row) => projectRow(row, selected)),
  };
}

export function projectRow(row: DataRow, columns: string[]): DataRow {
  const projected: DataRow = {};
  for (const column of columns) {
    projected[column] = getCell(row, column);
  }
  return projected;
}

export function roundExportRows(rows: DataRow[]): DataRow[] {
  return rows.map((row) => {
    const next: DataRow = {};
    for (const [column, value] of Object.entries(row)) {
      next[column] = roundExportValue(value);
    }
    return next;
  });
}

function roundExportValue(value: CellValue): CellValue {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value;
  }
  return Math.round(value * 100) / 100;
}

export function resolveLimitWindow(
  current: BufferWindowSpec | null,
  args: LimitRowsArgs,
): BufferWindowSpec {
  if (args.next) {
    if (!current) {
      throw new QueryError('No window to advance. Call limitRows with limit first.');
    }
    return {
      offset: current.offset + current.limit,
      limit: args.limit ?? current.limit,
    };
  }
  if (args.limit === undefined) {
    throw new QueryError('limit is required unless next is true');
  }
  return {
    offset: args.offset ?? 1,
    limit: args.limit,
  };
}

export function limitRows(rows: DataRow[], spec: BufferWindowSpec): DataRow[] {
  const offset = spec.offset;
  if (rows.length === 0) {
    return [];
  }
  if (offset > rows.length) {
    throw new QueryError(`offset ${offset} is past the end of the buffer (${rows.length} rows).`);
  }
  const start = offset - 1;
  return rows.slice(start, start + spec.limit);
}

export function windowHasMore(rowCount: number, spec: BufferWindowSpec, windowCount: number): boolean {
  return spec.offset - 1 + windowCount < rowCount;
}

export function previewRows(rows: DataRow[], columns: string[], spec: PreviewRowsArgs): PreviewResult {
  const selected = spec.columns ?? columns;
  for (const column of selected) {
    requireColumn(columns, column);
  }

  if (rows.length === 0) {
    return {
      rowCount: 0,
      offset: spec.offset,
      limit: spec.limit,
      hasMore: false,
      columns: selected,
      rows: [],
    };
  }

  if (spec.offset > rows.length) {
    throw new QueryError(`offset ${spec.offset} is past the end of the buffer (${rows.length} rows).`);
  }

  const start = spec.offset - 1;
  const slice = rows.slice(start, start + spec.limit);
  return {
    rowCount: rows.length,
    offset: spec.offset,
    limit: spec.limit,
    hasMore: start + slice.length < rows.length,
    columns: selected,
    rows: slice.map((row) => projectRow(row, selected)),
  };
}

function describeColumn(rows: DataRow[], name: string): ColumnStats {
  let type: ColumnType = 'null';
  let nullCount = 0;
  const seen = new Set<string>();
  let min: number | undefined;
  let max: number | undefined;

  for (const row of rows) {
    const cell = getCell(row, name);
    seen.add(cellKey(cell));
    if (cell === null) {
      nullCount += 1;
      continue;
    }
    if (type === 'null') {
      type = cellType(cell);
    }
    if (typeof cell === 'number') {
      min = min === undefined ? cell : Math.min(min, cell);
      max = max === undefined ? cell : Math.max(max, cell);
    }
  }

  const stats: ColumnStats = {
    name,
    type,
    nullCount,
    distinctCount: seen.size,
  };
  if (type === 'number' && min !== undefined && max !== undefined) {
    stats.min = min;
    stats.max = max;
  }
  return stats;
}

function cellType(value: Exclude<CellValue, null>): ColumnType {
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  return 'boolean';
}

function cellKey(value: CellValue): string {
  if (value === null) {
    return 'null';
  }
  return `${typeof value}:${JSON.stringify(value)}`;
}

function matchesClause(row: DataRow, clause: FilterClause): boolean {
  const cell = getCell(row, clause.column);

  if (clause.op === 'isNull') {
    return cell === null;
  }
  if (clause.op === 'isNotNull') {
    return cell !== null;
  }

  const value = requireClauseValue(clause);

  if (clause.op === 'in') {
    if (!Array.isArray(value)) {
      throw new QueryError('Operator "in" requires an array value');
    }
    return value.some((item) => Object.is(item, cell) || item === cell);
  }

  if (Array.isArray(value)) {
    throw new QueryError(`Operator "${clause.op}" does not accept an array; use "in"`);
  }

  if (clause.op === 'eq') {
    return cell === value;
  }
  if (clause.op === 'neq') {
    return cell !== value;
  }
  if (clause.op === 'contains') {
    if (typeof value !== 'string') {
      throw new QueryError('Operator "contains" requires a string value');
    }
    if (cell === null) {
      return false;
    }
    if (typeof cell !== 'string') {
      throw new QueryError(
        `Operator "contains" only works on string columns; "${clause.column}" is ${typeof cell}`,
      );
    }
    return cell.includes(value);
  }

  return compareOrdered(cell, value, clause.op);
}

function requireClauseValue(clause: FilterClause): CellValue | CellValue[] {
  if (clause.value === undefined) {
    throw new QueryError(`Operator "${clause.op}" requires a value`);
  }
  return clause.value;
}

function compareOrdered(
  cell: CellValue,
  value: CellValue,
  op: 'gt' | 'gte' | 'lt' | 'lte',
): boolean {
  if (cell === null || value === null) {
    return false;
  }
  if (typeof cell !== typeof value) {
    return false;
  }
  if (typeof cell === 'boolean' || typeof value === 'boolean') {
    return false;
  }

  const ordered =
    typeof cell === 'number' && typeof value === 'number'
      ? { left: cell, right: value }
      : typeof cell === 'string' && typeof value === 'string'
        ? { left: cell, right: value }
        : null;
  if (!ordered) {
    return false;
  }

  if (op === 'gt') {
    return ordered.left > ordered.right;
  }
  if (op === 'gte') {
    return ordered.left >= ordered.right;
  }
  if (op === 'lt') {
    return ordered.left < ordered.right;
  }
  return ordered.left <= ordered.right;
}

function compareSortCells(left: CellValue, right: CellValue, direction: 'asc' | 'desc'): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  let comparison = 0;
  if (typeof left === 'number' && typeof right === 'number') {
    comparison = left < right ? -1 : left > right ? 1 : 0;
  } else if (typeof left === 'string' && typeof right === 'string') {
    comparison = left < right ? -1 : left > right ? 1 : 0;
  } else if (typeof left === 'boolean' && typeof right === 'boolean') {
    comparison = left === right ? 0 : left ? 1 : -1;
  } else {
    comparison = String(left).localeCompare(String(right));
  }
  return direction === 'desc' ? -comparison : comparison;
}

function moneyWarnings(groupBy: string[], metrics: AggregateMetric[]): string[] {
  if (groupBy.includes('currency')) {
    return [];
  }

  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const metric of metrics) {
    if ((metric.op !== 'sum' && metric.op !== 'avg') || !metric.column) {
      continue;
    }
    if (!MONEY_COLUMNS.has(metric.column)) {
      continue;
    }
    const message = `${metric.column} mixes currencies; group by currency`;
    if (seen.has(message)) {
      continue;
    }
    seen.add(message);
    warnings.push(message);
  }
  return warnings;
}

function computeMetric(rows: DataRow[], metric: AggregateMetric): CellValue {
  if (metric.op === 'count') {
    if (!metric.column) {
      return rows.length;
    }
    return rows.filter((row) => getCell(row, metric.column!) !== null).length;
  }

  const values: number[] = [];
  for (const row of rows) {
    const cell = getCell(row, metric.column!);
    if (cell === null) {
      continue;
    }
    if (typeof cell !== 'number') {
      throw new QueryError(`Cannot ${metric.op} non-numeric column "${metric.column}"`);
    }
    values.push(cell);
  }

  if (values.length === 0) {
    return null;
  }

  if (metric.op === 'sum') {
    return values.reduce((total, value) => total + value, 0);
  }
  if (metric.op === 'avg') {
    return values.reduce((total, value) => total + value, 0) / values.length;
  }
  if (metric.op === 'min') {
    return Math.min(...values);
  }
  return Math.max(...values);
}
