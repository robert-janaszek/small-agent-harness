import { SALES_COLUMN_COUNT, SALES_ROW_COUNT } from './columns';
import type { Module, ModulePanel } from '../../core/module';
import {
  createContext,
  createEmptySnapshot,
  resetContext,
  snapshotDataTableState,
  type DataTableContext,
  type DataTableStateSnapshot,
} from './context';
import { paintBufferPanel } from './renderer/bufferPanel';

export const DATA_TABLE_MODULE_ID = 'dataTable';

export const DATA_TABLE_PROMPT = `You work on an in-memory tabular buffer of sales line items.

Small models drop, duplicate, and invent records when they scan tables in the prompt. Do not count, filter, sort, or aggregate rows in your head. Do not quote row payloads unless a tool returned them.

The buffer starts as the sales fixture (${SALES_ROW_COUNT} rows x ${SALES_COLUMN_COUNT} columns). Module state only reports rowCount, columnCount, and column names — not the cells.

Money columns mix EUR, USD, JPY, GBP, CAD, and SGD at catalog prices that are not FX-converted. Never sum lineTotal, lineNet, or similar money fields across currencies without grouping by currency.

You currently have no tools. If asked what tools you have, say so in one short sentence. Do not invent tool names or dump schemas.

Tools for filter, aggregate (sum/avg/max/min/count), paginated preview, and sending the full buffer to the user (bypassing the model) will be added next. Until those tools exist, do not claim specific totals or row lists.

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
  const emitState = (runtime: { emit: (event: string, payload?: unknown) => void }) => {
    runtime.emit('state', snapshotDataTableState(context));
  };

  return {
    id: DATA_TABLE_MODULE_ID,
    context,
    prompt: DATA_TABLE_PROMPT,
    createPanel: createDataTablePanel,
    onSessionStart: emitState,
    onSessionReset: (runtime) => {
      resetContext(context);
      emitState(runtime);
    },
    onToolRound: emitState,
  };
}
