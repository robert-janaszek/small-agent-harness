import { defineTool } from '../../core/tool';
import { resetContext, type DataTableContext } from './context';
import { resetBufferArgsSchema, type ResetBufferArgs } from './schemas';

export const resetBufferTool = defineTool<ResetBufferArgs, DataTableContext>({
  name: 'resetBuffer',
  description:
    'Restores the in-memory buffer to the original sales fixture (rows and columns). ' +
    'Use this after filterRows, sortRows, or aggregate when you need the full table again.',
  argsSchema: resetBufferArgsSchema,
  activity: {
    present: 'resetting',
    past: 'reset',
    target: () => 'buffer',
  },
  call(context) {
    resetContext(context);
    return JSON.stringify({
      rowCount: context.rows.length,
      columnCount: context.columns.length,
    });
  },
});
