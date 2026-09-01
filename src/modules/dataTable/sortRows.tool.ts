import { defineTool, quoteActivityTarget, toolFailure } from '../../core/tool';
import type { DataTableContext } from './context';
import { QueryError, sortRows } from './query';
import { sortRowsArgsSchema, type SortRowsArgs } from './schemas';

export const sortRowsTool = defineTool<SortRowsArgs, DataTableContext>({
  name: 'sortRows',
  description:
    'Sorts the in-memory buffer by one or more columns. Nulls stay last. ' +
    'Returns the rowCount. Does not return row payloads.',
  argsSchema: sortRowsArgsSchema,
  activity: {
    present: 'sorting',
    past: 'sorted',
    target: (args) => quoteActivityTarget(args.keys[0]?.column ?? 'buffer'),
  },
  call(context, args) {
    try {
      context.rows = sortRows(context.rows, context.columns, args.keys);
      return JSON.stringify({ rowCount: context.rows.length });
    } catch (error) {
      if (error instanceof QueryError) {
        return toolFailure(error.message);
      }
      throw error;
    }
  },
});
