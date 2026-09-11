import { defineTool, quoteActivityTarget, toolFailure } from '../../core/tool';
import { clearWindow, type DataTableContext } from './context';
import { QueryError, selectColumns } from './query';
import { selectColumnsArgsSchema, type SelectColumnsArgs } from './schemas';
import { withSendBufferGate } from './sendBufferToUser.tool';

export const selectColumnsTool = defineTool<SelectColumnsArgs, DataTableContext>({
  name: 'selectColumns',
  description:
    'Keeps only the given columns, in this order, and replaces the in-memory buffer schema. ' +
    'Returns the new column list. Does not return row payloads. ' +
    'The user cannot see this change. After the last mutation this turn, call sendBufferToUser. ' +
    'Call resetBuffer to restore the original fixture.',
  argsSchema: selectColumnsArgsSchema,
  activity: {
    present: 'selecting',
    past: 'selected',
    target: (args) => quoteActivityTarget(args.columns.join(', ')),
  },
  call(context, args) {
    try {
      const result = selectColumns(context.rows, context.columns, args.columns);
      context.rows = result.rows;
      context.columns = result.columns;
      clearWindow(context);
      return withSendBufferGate({
        rowCount: result.rows.length,
        columnCount: result.columns.length,
        columns: result.columns,
      });
    } catch (error) {
      if (error instanceof QueryError) {
        return toolFailure(error.message);
      }
      throw error;
    }
  },
});
