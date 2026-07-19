import { parseDocument } from 'yaml';

import { defineTool } from '../../tools/defineTool';
import type { YamlRepairContext } from './context';
import { getLines, readFileText } from './fileOps';
import { yamlParseArgsSchema } from './schemas';

function errorSummary(message: string): string {
  const snippetStart = message.indexOf('\n\n');
  const head = snippetStart === -1 ? message : message.slice(0, snippetStart);
  return head.trimEnd().replace(/:$/, '');
}

function formatYamlError(
  error: {
    message: string;
    linePos?: Array<{ line: number; col: number }> | null;
    code?: string;
  },
  lines: string[],
): string {
  const summary = errorSummary(error.message);
  const code = error.code ? ` (${error.code})` : '';
  const position = error.linePos?.[0];

  if (!position) {
    return `${summary}${code}`;
  }

  const offendingLine = lines[position.line - 1];
  const lineText =
    offendingLine !== undefined ? offendingLine : '(could not read line from file)';

  return (
    `${summary}${code}\n` +
    `   Offending line ${position.line}, column ${position.col}: ${lineText}`
  );
}

const MAX_ERRORS_SHOWN = 5;

function formatErrorDetails(
  errors: NonNullable<ReturnType<typeof parseDocument>['errors']>,
  lines: string[],
): string {
  const shown = errors.slice(0, MAX_ERRORS_SHOWN);
  const details = shown
    .map((error, index) => `${index + 1}. ${formatYamlError(error, lines)}`)
    .join('\n\n');

  const remaining = errors.length - shown.length;
  if (remaining <= 0) {
    return details;
  }

  const noun = remaining === 1 ? 'error' : 'errors';
  return `${details}\n\n… and ${remaining} more ${noun} not shown.`;
}

export const yamlParseTool = defineTool<Record<string, never>, YamlRepairContext>({
  name: 'yamlParse',
  description:
    'Parses the YAML work file and reports whether it is valid. ' +
    'On failure, returns up to five parser errors with the exact offending line text from the file, plus a count of any remaining errors. ' +
    'Call this after edits to confirm the file is repaired.',
  argsSchema: yamlParseArgsSchema,
  call(context) {
    const text = readFileText(context.filePath);
    const lines = getLines(context.filePath);
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

    const details = formatErrorDetails(errors, lines);
    return (
      `The YAML file failed to parse (${errors.length} error(s)). Fix these issues:\n\n${details}`
    );
  },
});
