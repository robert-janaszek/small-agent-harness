import { defineTool } from '../../core/tool';
import type { DataTableContext } from './context';
import { limitRows, roundExportRows, windowHasMore } from './query';
import { sendBufferToUserArgsSchema, type SendBufferToUserArgs } from './schemas';

/** In-band reminder on mutating tool results: a prior export is stale after sort/filter/select. */
export const SEND_BUFFER_AFTER_MUTATION =
  'call sendBufferToUser; the user cannot see this change; a previous export is stale';

export function withSendBufferGate<T extends Record<string, unknown>>(payload: T): string {
  return JSON.stringify({ ...payload, next: SEND_BUFFER_AFTER_MUTATION });
}

export const sendBufferToUserTool = defineTool<SendBufferToUserArgs, DataTableContext>({
  name: 'sendBufferToUser',
  description:
    'Sends the current window to the user if limitRows set one, otherwise the entire buffer. ' +
    'Rows bypass you so they cannot be dropped or invented. ' +
    'Required after filterRows, selectColumns, sortRows, limitRows, or aggregate — a previous send is stale after a later mutation. ' +
    'Does not change the buffer. Returns only counts — do not reprint the rows.',
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
      message: 'do not reprint these rows',
    });
  },
});
