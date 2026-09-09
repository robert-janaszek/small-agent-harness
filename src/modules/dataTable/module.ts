import { SALES_COLUMN_COUNT, SALES_ROW_COUNT } from './columns';
import type { Module, ModulePanel } from '../../core/module';
import type { Tool } from '../../core/tool';
import { aggregateTool } from './aggregate.tool';
import {
  createContext,
  createEmptySnapshot,
  resetContext,
  snapshotDataTableState,
  type DataTableContext,
  type DataTableStateSnapshot,
} from './context';
import { describeTableTool } from './describeTable.tool';
import { filterRowsTool } from './filterRows.tool';
import { previewRowsTool } from './previewRows.tool';
import { paintBufferPanel } from './renderer/bufferPanel';
import { resetBufferTool } from './resetBuffer.tool';
import { selectColumnsTool } from './selectColumns.tool';
import { sendBufferToUserTool } from './sendBufferToUser.tool';
import { sortRowsTool } from './sortRows.tool';

export const DATA_TABLE_MODULE_ID = 'dataTable';

export const DATA_TABLE_PROMPT = `You work on an in-memory tabular buffer of sales line items.

Small models drop, duplicate, and invent records when they scan tables in the prompt. Do not count, filter, sort, or aggregate rows in your head. Do not quote row payloads unless a tool returned them. Numbers and row lists in your reply must come from a tool result.

The buffer starts as the sales fixture (${SALES_ROW_COUNT} rows x ${SALES_COLUMN_COUNT} columns). Module state only reports rowCount, columnCount, and column names — not the cells. Call describeTable to learn column types and distinct values.

Money columns mix EUR, USD, JPY, GBP, CAD, and SGD. Catalog prices start in EUR and are converted to the customer currency. Never sum lineTotal, lineNet, or similar money fields across currencies without grouping by currency.

Tools:
- describeTable: column stats; pass column to list distinct values (capped).
- filterRows: keep matching rows (AND by default). Mutates the buffer.
- selectColumns: keep only the given columns, in order. Mutates the buffer.
- sortRows: order the buffer. Mutates the buffer.
- aggregate: groupBy + count/sum/avg/min/max. Replaces the buffer with the result table and returns those rows.
- previewRows: paginated cells for you (offset 1-based, max 10 rows). Optional columns project the read without changing the buffer.
- sendBufferToUser: the only way to give the user the full current buffer. Rows bypass you; do not reprint them.
- resetBuffer: restore the original sales fixture after a filter, select, sort, or aggregate.

filterRows, selectColumns, sortRows, and aggregate replace the working set. Call resetBuffer when you need the original table again.
previewRows cannot return the whole buffer. After aggregate, do not preview for confirmation if the grouped rows are already in the tool result.
After sendBufferToUser, do not quote or rewrite the exported rows.

Do not ask the user a question.`;

export type DataTableModule = Module & { context: DataTableContext };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isDataTableStateSnapshot(payload: unknown): payload is DataTableStateSnapshot {
  if (!isPlainObject(payload)) {
    return false;
  }

  if (typeof payload.sourceId !== 'string' || typeof payload.description !== 'string') {
    return false;
  }

  if (!isNonNegativeFinite(payload.rowCount) || !isNonNegativeFinite(payload.columnCount)) {
    return false;
  }

  if (!Array.isArray(payload.columns) || !payload.columns.every((column) => typeof column === 'string')) {
    return false;
  }

  return payload.columnCount === payload.columns.length;
}

export function createDataTablePanel(): ModulePanel {
  let state: DataTableStateSnapshot = createEmptySnapshot();

  return {
    onEvent(event, payload) {
      if (event === 'state' && isDataTableStateSnapshot(payload)) {
        state = payload;
      }
    },
    paint({ terminal, startCol, width, height }) {
      paintBufferPanel(terminal, startCol, width, height, state);
    },
  };
}

export function createDataTableModule(): DataTableModule {
  const context = createContext();
  const bindRuntime = (runtime: { emit: (event: string, payload?: unknown) => void }) => {
    context.emit = (event, payload) => runtime.emit(event, payload);
  };
  const emitState = (runtime: { emit: (event: string, payload?: unknown) => void }) => {
    bindRuntime(runtime);
    runtime.emit('state', snapshotDataTableState(context));
  };

  return {
    id: DATA_TABLE_MODULE_ID,
    context,
    prompt: DATA_TABLE_PROMPT,
    tools: [
      describeTableTool(context),
      filterRowsTool(context),
      selectColumnsTool(context),
      sortRowsTool(context),
      aggregateTool(context),
      previewRowsTool(context),
      sendBufferToUserTool(context),
      resetBufferTool(context),
    ] as Tool<any>[],
    createPanel: createDataTablePanel,
    onSessionStart: emitState,
    onSessionReset: (runtime) => {
      resetContext(context);
      emitState(runtime);
    },
    onToolRound: emitState,
  };
}
