import { defineTool } from '../../tools/defineTool';
import type { YamlRepairContext } from './context';
import { formatNumberedLines, getLines } from './fileOps';
import { READ_MAX_LIMIT, readArgsSchema } from './schemas';

export const readTool = defineTool<
  { offset: number; limit: number },
  YamlRepairContext
>({
  name: 'read',
  description:
    `Reads a contiguous range of lines from the YAML work file. ` +
    `offset is 1-based. limit must be between 1 and ${READ_MAX_LIMIT}. ` +
    `Never attempt to read the whole file; use grep to locate regions, then read small windows.`,
  argsSchema: readArgsSchema,
  call(context, args) {
    if (args.limit > READ_MAX_LIMIT) {
      return `Cannot read ${args.limit} lines at once. The maximum limit is ${READ_MAX_LIMIT}. Use a smaller window.`;
    }

    const lines = getLines(context.filePath);
    if (lines.length === 0) {
      return 'The file is empty.';
    }

    if (args.offset > lines.length) {
      return `offset ${args.offset} is past the end of the file (${lines.length} lines).`;
    }

    const startIndex = args.offset - 1;
    const slice = lines.slice(startIndex, startIndex + args.limit);
    const endLine = startIndex + slice.length;
    const header = `Showing lines ${args.offset}-${endLine} of ${lines.length}.`;
    return `${header}\n${formatNumberedLines(slice, args.offset)}`;
  },
});
