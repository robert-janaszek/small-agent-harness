import { defineTool } from '../../core/tool';
import type { DataTableContext } from './context';
import { roundExportRows } from './query';
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
    'Sends the entire current buffer to the user, bypassing you so rows cannot be dropped or invented. ' +
    'Required after filterRows, selectColumns, sortRows, or aggregate — a previous send is stale after a later mutation. ' +
    'Does not change the buffer. Returns only row and column counts — do not reprint the rows.',
  argsSchema: sendBufferToUserArgsSchema,
  activity: {
    present: 'sending',
    past: 'sent',
    target: () => 'buffer',
  },
  call(context) {
    const columns = [...context.columns];
    const rows = roundExportRows(structuredClone(context.rows));
    context.emit('export', {
      sourceId: context.sourceId,
      description: context.description,
      rowCount: rows.length,
      columnCount: columns.length,
      columns,
      rows,
    });
    return JSON.stringify({
      sent: true,
      rowCount: rows.length,
      columnCount: columns.length,
      columns,
      message: 'do not reprint these rows',
    });
  },
});
