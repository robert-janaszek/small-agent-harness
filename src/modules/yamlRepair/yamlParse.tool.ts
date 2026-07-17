import { parseDocument } from 'yaml';

import { defineTool } from '../../tools/defineTool';
import type { YamlRepairContext } from './context';
import { readFileText } from './fileOps';
import { yamlParseArgsSchema } from './schemas';

function formatYamlError(error: {
  message: string;
  linePos?: Array<{ line: number; col: number }> | null;
  code?: string;
}): string {
  const position = error.linePos?.[0];
  const where = position
    ? ` at line ${position.line}, column ${position.col}`
    : '';
  const code = error.code ? ` (${error.code})` : '';
  return `${error.message}${where}${code}`;
}

export const yamlParseTool = defineTool<Record<string, never>, YamlRepairContext>({
  name: 'yamlParse',
  description:
    'Parses the YAML work file and reports whether it is valid. ' +
    'On failure, returns a prose description of each parser error with line/column when available. ' +
    'Call this after edits to confirm the file is repaired.',
  argsSchema: yamlParseArgsSchema,
  call(context) {
    const text = readFileText(context.filePath);
    const doc = parseDocument(text, { prettyErrors: true });
    const errors = doc.errors ?? [];

    if (errors.length === 0) {
      // Still surface warnings lightly so the agent can decide, but success means parseable.
      const warningCount = doc.warnings?.length ?? 0;
      if (warningCount > 0) {
        return `The YAML file parsed successfully with ${warningCount} warning(s). Structure looks valid.`;
      }
      return 'The YAML file parsed successfully with no errors.';
    }

    const details = errors.map((error, index) => `${index + 1}. ${formatYamlError(error)}`).join('\n');
    return (
      `The YAML file failed to parse (${errors.length} error(s)). Fix these issues:\n${details}`
    );
  },
});
