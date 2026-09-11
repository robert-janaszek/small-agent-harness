import { defineTool, toolFailure } from '../../core/tool';
import type { DataTableContext } from './context';
import { QueryError, limitRows, resolveLimitWindow, windowHasMore } from './query';
import { limitRowsArgsSchema, type LimitRowsArgs } from './schemas';
import { withSendBufferGate } from './sendBufferToUser.tool';

export const limitRowsTool = defineTool<LimitRowsArgs, DataTableContext>({
  name: 'limitRows',
  description:
    'Sets a send window over the current buffer without dropping rows (SQL LIMIT / OFFSET). ' +
    'offset is 1-based and defaults to 1. limit is the page size. ' +
    'Pass next: true to advance one page — do not re-sort or reset for "the next N rows". ' +
    'sendBufferToUser exports the window, not the whole buffer. ' +
    'Does not return row payloads. After this call, sendBufferToUser. ' +
    'previewRows is a read for you and does not set the window.',
  argsSchema: limitRowsArgsSchema,
  activity: {
    present: 'limiting',
    past: 'limited',
    target: (args) => {
      if (args.next) {
        return 'next page';
      }
      const offset = args.offset ?? 1;
      const limit = args.limit ?? 0;
      return `rows ${offset}-${offset + limit - 1}`;
    },
  },
  call(context, args) {
    try {
      const window = resolveLimitWindow(context.window, args);
      const slice = limitRows(context.rows, window);
      context.window = window;
      return withSendBufferGate({
        rowCount: context.rows.length,
        windowCount: slice.length,
        offset: window.offset,
        limit: window.limit,
        hasMore: windowHasMore(context.rows.length, window, slice.length),
      });
    } catch (error) {
      if (error instanceof QueryError) {
        return toolFailure(error.message);
      }
      throw error;
    }
  },
});
