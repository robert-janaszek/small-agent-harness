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

const MAX_ERRORS_SHOWN = 5;

function formatErrorDetails(errors: NonNullable<ReturnType<typeof parseDocument>['errors']>): string {
  const shown = errors.slice(0, MAX_ERRORS_SHOWN);
  const details = shown
    .map((error, index) => `${index + 1}. ${formatYamlError(error)}`)
    .join('\n');

  const remaining = errors.length - shown.length;
  if (remaining <= 0) {
    return details;
  }

  const noun = remaining === 1 ? 'error' : 'errors';
  return `${details}\n… and ${remaining} more ${noun} not shown.`;
}

export const yamlParseTool = defineTool<Record<string, never>, YamlRepairContext>({
  name: 'yamlParse',
  description:
    'Parses the YAML work file and reports whether it is valid. ' +
    'On failure, returns up to five parser errors with line/column when available, plus a count of any remaining errors. ' +
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

    const details = formatErrorDetails(errors);
    return (
      `The YAML file failed to parse (${errors.length} error(s)). Fix these issues:\n${details}`
    );
  },
});
