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
import { limitRowsTool } from './limitRows.tool';
import { previewRowsTool } from './previewRows.tool';
import { paintBufferPanel } from './renderer/bufferPanel';
import { resetBufferTool } from './resetBuffer.tool';
import { selectColumnsTool } from './selectColumns.tool';
import { sendBufferToUserTool } from './sendBufferToUser.tool';
import { sortRowsTool } from './sortRows.tool';

export const DATA_TABLE_MODULE_ID = 'dataTable';

export const DATA_TABLE_PROMPT = `You work on an in-memory tabular buffer of sales line items.

Small models drop, duplicate, and invent records when they scan tables in the prompt. Do not count, filter, sort, limit, or aggregate rows in your head. Do not quote row payloads unless a tool returned them. Numbers and row lists in your reply must come from a tool result.

The buffer starts as the sales fixture (${SALES_ROW_COUNT} rows x ${SALES_COLUMN_COUNT} columns). Module state only reports rowCount, columnCount, and column names — not the cells. The user cannot see the buffer. Call describeTable to learn column types and distinct values.

Money columns mix EUR, USD, JPY, GBP, CAD, and SGD. Catalog prices start in EUR and are converted to the customer currency. Never sum lineTotal, lineNet, or similar money fields across currencies without grouping by currency.

Tools:
- describeTable: column stats; pass column to list distinct values (capped).
- filterRows: keep matching rows (AND by default). Mutates the buffer.
- selectColumns: keep only the given columns, in order. Mutates the buffer.
- sortRows: order the buffer. Mutates the buffer and clears the send window.
- limitRows: set a send window (SQL LIMIT / OFFSET) without dropping rows. offset is 1-based, default 1. Pass next: true for the following page — do not re-sort. previewRows does not set the window.
- aggregate: groupBy + count/sum/avg/min/max. Replaces the buffer with the result table and returns those rows.
- previewRows: paginated cells for you (offset 1-based, max 10 rows). Optional columns project the read without changing the buffer. Does not show anything to the user.
- sendBufferToUser: the only way to give the user rows. Sends the window if one is set, otherwise the full buffer. Rows bypass you; do not reprint them.
- resetBuffer: restore the original sales fixture after a filter, select, sort, or aggregate.

After filterRows, selectColumns, or sortRows, the turn is not done until you call sendBufferToUser. Call it after the last mutation this turn, even if you already exported earlier in the session — that export is stale.
After limitRows, call sendBufferToUser so the user sees the window. The working set stays intact so you can call limitRows with next for the following page.
After aggregate, call sendBufferToUser so the user sees the result table. You may also answer from the aggregate tool result. Do not preview for confirmation if those rows are already in the tool result.
filterRows, selectColumns, sortRows, and aggregate replace the working set and clear the send window. Call resetBuffer when you need the original table again.
After sendBufferToUser, do not quote or rewrite the exported rows.

Do not ask the user a question.`;

export type DataTableModule = Module & { context: DataTableContext };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1;
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

  if (payload.columnCount !== payload.columns.length) {
    return false;
  }

  if (payload.window === undefined || payload.window === null) {
    return true;
  }

  if (!isPlainObject(payload.window)) {
    return false;
  }

  return isPositiveFinite(payload.window.offset) && isPositiveFinite(payload.window.limit);
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
      limitRowsTool(context),
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
