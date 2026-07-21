import { defineTool } from '../../tools/defineTool';
import type { YamlRepairContext } from './context';
import { writeFileText } from './fileOps';
import { undoArgsSchema } from './schemas';

export const undoTool = defineTool<Record<string, never>, YamlRepairContext>({
  name: 'undo',
  description:
    'Reverts the work file to the state before the last successful replace. ' +
    'Call yamlParse after undo to verify the restored content.',
  argsSchema: undoArgsSchema,
  call(context) {
    const previous = context.popSnapshot();
    if (previous === undefined) {
      return 'Nothing to undo.';
    }

    writeFileText(context.filePath, previous);
    const remaining = context.history.length;
    const noun = remaining === 1 ? 'edit' : 'edits';
    return `Restored previous version (${remaining} ${noun} remaining in history).`;
  },
});
