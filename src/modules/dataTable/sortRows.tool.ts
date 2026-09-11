import { defineTool, quoteActivityTarget, toolFailure } from '../../core/tool';
import { clearWindow, type DataTableContext } from './context';
import { QueryError, sortRows } from './query';
import { sortRowsArgsSchema, type SortRowsArgs } from './schemas';
import { withSendBufferGate } from './sendBufferToUser.tool';

export const sortRowsTool = defineTool<SortRowsArgs, DataTableContext>({
  name: 'sortRows',
  description:
    'Sorts the in-memory buffer by one or more columns. Nulls stay last. ' +
    'Returns the rowCount. Does not return row payloads. ' +
    'The user cannot see this change and a previous export is stale. Call sendBufferToUser after this sort.',
  argsSchema: sortRowsArgsSchema,
  activity: {
    present: 'sorting',
    past: 'sorted',
    target: (args) => quoteActivityTarget(args.keys[0]?.column ?? 'buffer'),
  },
  call(context, args) {
    try {
      context.rows = sortRows(context.rows, context.columns, args.keys);
      clearWindow(context);
      return withSendBufferGate({ rowCount: context.rows.length });
    } catch (error) {
      if (error instanceof QueryError) {
        return toolFailure(error.message);
      }
      throw error;
    }
  },
});
