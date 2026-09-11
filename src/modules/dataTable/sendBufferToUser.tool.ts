import { isOriginalColumnSchema, type DataTableContext } from './context';
import { defineTool } from '../../core/tool';
import { limitRows, roundExportRows, sampleSentRows, windowHasMore } from './query';
import {
  SEND_SAMPLE_MAX_COLUMNS,
  SEND_SAMPLE_MAX_ROWS,
  sendBufferToUserArgsSchema,
  type SendBufferToUserArgs,
} from './schemas';

/** In-band reminder on mutating tool results: a prior export is stale after sort/filter/select. */
export const SEND_BUFFER_AFTER_MUTATION =
  'call sendBufferToUser; the user cannot see this change; a previous export is stale';

export function withSendBufferGate<T extends Record<string, unknown>>(payload: T): string {
  return JSON.stringify({ ...payload, next: SEND_BUFFER_AFTER_MUTATION });
}

function sentMessage(options: {
  rowCount: number;
  columnCount: number;
  sampleRowCount: number;
  sampleColumnCount: number;
  omittedRows: number;
  omittedColumns: number;
  windowSet: boolean;
}): string {
  const parts = [
    `all ${options.rowCount} rows and ${options.columnCount} columns were sent to the user`,
  ];
  if (options.omittedRows > 0) {
    parts.push(
      `sample shows the first ${options.sampleRowCount} rows; do not invent the remaining ${options.omittedRows} rows`,
    );
  }
  if (options.omittedColumns > 0) {
    parts.push(
      `sample shows ${options.sampleColumnCount} of ${options.columnCount} columns; call selectColumns to choose columns before sending`,
    );
  }
  if (!options.windowSet) {
    parts.push('no send window is set; call limitRows first when the user asked for a slice or top-N');
  }
  if (options.omittedRows === 0 && options.omittedColumns === 0) {
    parts.push('do not reprint or invent rows');
  }
  return parts.join('; ');
}

export const sendBufferToUserTool = defineTool<SendBufferToUserArgs, DataTableContext>({
  name: 'sendBufferToUser',
  description:
    'Sends the current window to the user if limitRows set one, otherwise the entire buffer. ' +
    'The user receives every sent row and column. You get a short sample ' +
    `(at most ${SEND_SAMPLE_MAX_ROWS} rows, and ${SEND_SAMPLE_MAX_COLUMNS} columns unless selectColumns already projected the schema). ` +
    'Do not invent rows or columns that are not in the sample. ' +
    'If the user asked for a slice or top-N, call limitRows before this tool. ' +
    'If they asked for specific columns, call selectColumns first. ' +
    'Required after filterRows, selectColumns, sortRows, limitRows, or aggregate — a previous send is stale after a later mutation. ' +
    'Does not change the buffer. Do not call previewRows to confirm.',
  argsSchema: sendBufferToUserArgsSchema,
  activity: {
    present: 'sending',
    past: 'sent',
    target: () => 'buffer',
  },
  call(context) {
    const columns = [...context.columns];
    const window = context.window;
    const sourceRows = window ? limitRows(context.rows, window) : context.rows;
    const rows = roundExportRows(structuredClone(sourceRows));
    const hasMore = window ? windowHasMore(context.rows.length, window, rows.length) : false;
    const capColumns = isOriginalColumnSchema(context) ? SEND_SAMPLE_MAX_COLUMNS : undefined;
    const { sample, omitted, sampleColumns, omittedColumns } = sampleSentRows(rows, columns, {
      maxColumns: capColumns,
    });
    context.emit('export', {
      sourceId: context.sourceId,
      description: context.description,
      rowCount: rows.length,
      bufferRowCount: context.rows.length,
      columnCount: columns.length,
      columns,
      rows,
      window: window
        ? { offset: window.offset, limit: window.limit, rowCount: rows.length, hasMore }
        : null,
    });
    return JSON.stringify({
      sent: true,
      rowCount: rows.length,
      bufferRowCount: context.rows.length,
      columnCount: columns.length,
      columns,
      offset: window?.offset,
      limit: window?.limit,
      hasMore,
      windowSet: window !== null,
      sample,
      sampleColumns,
      sampleTruncated: omitted > 0,
      omitted,
      omittedColumns,
      message: sentMessage({
        rowCount: rows.length,
        columnCount: columns.length,
        sampleRowCount: sample.length,
        sampleColumnCount: sampleColumns.length,
        omittedRows: omitted,
        omittedColumns,
        windowSet: window !== null,
      }),
    });
  },
});
