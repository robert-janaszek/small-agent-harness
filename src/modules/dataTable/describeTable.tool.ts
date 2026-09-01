import { defineTool, quoteActivityTarget, toolFailure } from '../../core/tool';
import type { DataTableContext } from './context';
import { QueryError, describeTable } from './query';
import { describeTableArgsSchema } from './schemas';

export const describeTableTool = defineTool<
  { column?: string },
  DataTableContext
>({
  name: 'describeTable',
  description:
    'Returns column names, inferred types, null counts, and distinct counts for the current buffer. ' +
    'Pass column to also list distinct values for that column (capped). Does not return row payloads.',
  argsSchema: describeTableArgsSchema,
  activity: {
    present: 'describing',
    past: 'described',
    target: (args) => (args.column ? quoteActivityTarget(args.column) : 'columns'),
  },
  call(context, args) {
    try {
      return JSON.stringify(describeTable(context.rows, context.columns, args.column));
    } catch (error) {
      if (error instanceof QueryError) {
        return toolFailure(error.message);
      }
      throw error;
    }
  },
});
