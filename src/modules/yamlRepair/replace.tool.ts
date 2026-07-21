import { defineTool } from '../../tools/defineTool';
import type { YamlRepairContext } from './context';
import { readFileText, replaceExact, writeFileText } from './fileOps';
import { replaceArgsSchema } from './schemas';

export const replaceTool = defineTool<
  {
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  },
  YamlRepairContext
>({
  name: 'replace',
  description:
    'Replaces exact text in the YAML work file. old_string must match the file contents exactly. ' +
    'By default the match must be unique; set replace_all to true to replace every occurrence. ' +
    'Prefer small, targeted edits. After editing, call yamlParse to verify.',
  argsSchema: replaceArgsSchema,
  call(context, args) {
    const content = readFileText(context.filePath);
    const result = replaceExact(
      content,
      args.old_string,
      args.new_string,
      args.replace_all === true,
    );

    if (!result.ok) {
      return result.reason;
    }

    context.pushSnapshot(content);
    writeFileText(context.filePath, result.content);
    const noun = result.replacements === 1 ? 'replacement' : 'replacements';
    return `Applied ${result.replacements} ${noun} successfully.`;
  },
});
