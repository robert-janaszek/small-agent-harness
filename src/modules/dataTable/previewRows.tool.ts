import { defineTool, toolFailure } from '../../core/tool';
import type { DataTableContext } from './context';
import { QueryError, previewRows } from './query';
import { PREVIEW_MAX_LIMIT, previewRowsArgsSchema, type PreviewRowsArgs } from './schemas';

export const previewRowsTool = defineTool<PreviewRowsArgs, DataTableContext>({
  name: 'previewRows',
  description:
    `Returns a paginated slice of the current buffer for you to read. ` +
    `offset is 1-based. limit must be between 1 and ${PREVIEW_MAX_LIMIT}. ` +
    `Optional columns project this read only and do not change the buffer. ` +
    `Never try to preview the whole table. Does not show anything to the user — call sendBufferToUser for that.`,
  argsSchema: previewRowsArgsSchema,
  activity: {
    present: 'previewing',
    past: 'previewed',
    target: (args) => `rows ${args.offset}-${args.offset + args.limit - 1}`,
  },
  call(context, args) {
    if (args.limit > PREVIEW_MAX_LIMIT) {
      return toolFailure(
        `Cannot preview ${args.limit} rows at once. The maximum limit is ${PREVIEW_MAX_LIMIT}.`,
      );
    }

    try {
      return JSON.stringify(previewRows(context.rows, context.columns, args));
    } catch (error) {
      if (error instanceof QueryError) {
        return toolFailure(error.message);
      }
      throw error;
    }
  },
});
