import { defineTool, toolFailure } from '../../core/tool';
import type { DataTableContext } from './context';
import { QueryError, aggregateRows } from './query';
import { aggregateArgsSchema, type AggregateArgs } from './schemas';

export const aggregateTool = defineTool<AggregateArgs, DataTableContext>({
  name: 'aggregate',
  description:
    'Groups the current buffer and computes count, sum, avg, min, or max. ' +
    'Replaces the buffer with the result table and returns those rows. ' +
    'Omit groupBy (or pass []) for a single total row. ' +
    'Money columns mix currencies; group by currency before summing lineTotal or similar fields. ' +
    'Call resetBuffer to restore the original fixture.',
  argsSchema: aggregateArgsSchema,
  activity: {
    present: 'aggregating',
    past: 'aggregated',
    target: (args) => {
      const groups = args.groupBy ?? [];
      return groups.length > 0 ? groups.join(', ') : 'totals';
    },
  },
  call(context, args) {
    try {
      const result = aggregateRows(context.rows, context.columns, args);
      context.rows = result.rows;
      context.columns = result.columns;
      return JSON.stringify({
        rowCount: result.rows.length,
        columns: result.columns,
        rows: result.rows,
        warnings: result.warnings,
      });
    } catch (error) {
      if (error instanceof QueryError) {
        return toolFailure(error.message);
      }
      throw error;
    }
  },
});
