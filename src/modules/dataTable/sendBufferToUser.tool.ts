import { defineTool } from '../../core/tool';
import type { DataTableContext } from './context';
import { limitRows, roundExportRows, sampleSentRows, windowHasMore } from './query';
import { SEND_SAMPLE_MAX_ROWS, sendBufferToUserArgsSchema, type SendBufferToUserArgs } from './schemas';

/** In-band reminder on mutating tool results: a prior export is stale after sort/filter/select. */
export const SEND_BUFFER_AFTER_MUTATION =
  'call sendBufferToUser; the user cannot see this change; a previous export is stale';

export function withSendBufferGate<T extends Record<string, unknown>>(payload: T): string {
  return JSON.stringify({ ...payload, next: SEND_BUFFER_AFTER_MUTATION });
}

function sentMessage(rowCount: number, sampleCount: number, omitted: number): string {
  if (omitted > 0) {
    return (
      `all ${rowCount} rows were sent to the user; sample shows the first ${sampleCount}; ` +
      `do not invent the remaining ${omitted} rows`
    );
  }
  return `all ${rowCount} rows were sent to the user; do not reprint or invent rows`;
}

export const sendBufferToUserTool = defineTool<SendBufferToUserArgs, DataTableContext>({
  name: 'sendBufferToUser',
  description:
    'Sends the current window to the user if limitRows set one, otherwise the entire buffer. ' +
    'The user receives the full sent table. You get a short sample of those rows so you can refer to them — ' +
    `at most ${SEND_SAMPLE_MAX_ROWS}. Do not invent rows that are not in the sample. ` +
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
    const { sample, omitted } = sampleSentRows(rows);
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
      sample,
      sampleTruncated: omitted > 0,
      omitted,
      message: sentMessage(rows.length, sample.length, omitted),
    });
  },
});
