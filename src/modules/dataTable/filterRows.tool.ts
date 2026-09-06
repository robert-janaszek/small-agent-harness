import { defineTool, toolFailure } from '../../core/tool';
import type { DataTableContext } from './context';
import { QueryError, filterRows } from './query';
import { filterRowsArgsSchema, type FilterRowsArgs } from './schemas';

export const filterRowsTool = defineTool<FilterRowsArgs, DataTableContext>({
  name: 'filterRows',
  description:
    'Keeps rows that match the given clauses and replaces the in-memory buffer. ' +
    'Clauses are combined with AND (match all) by default, or OR (match any). ' +
    'Returns the new rowCount and how many rows were dropped. Does not return row payloads. ' +
    'Call resetBuffer to restore the original fixture.',
  argsSchema: filterRowsArgsSchema,
  activity: {
    present: 'filtering',
    past: 'filtered',
    target: (args) => {
      const count = args.where.length;
      return `${count} clause${count === 1 ? '' : 's'}`;
    },
  },
  call(context, args) {
    try {
      const next = filterRows(context.rows, context.columns, args);
      const dropped = context.rows.length - next.length;
      context.rows = next;
      return JSON.stringify({ rowCount: next.length, dropped });
    } catch (error) {
      if (error instanceof QueryError) {
        return toolFailure(error.message);
      }
      throw error;
    }
  },
});
