import { defineTool } from '../../tools/defineTool';
import type { YamlRepairContext } from './context';
import { getLines } from './fileOps';
import { grepArgsSchema } from './schemas';

export const grepTool = defineTool<
  {
    pattern: string;
    caseInsensitive?: boolean;
    maxMatches?: number;
  },
  YamlRepairContext
>({
  name: 'grep',
  description:
    'Searches the YAML work file for a regular expression or literal pattern. ' +
    'Returns matching lines with line numbers and a short surrounding context. ' +
    'Use this to locate errors and placeholders without reading the whole file.',
  argsSchema: grepArgsSchema,
  call(context, args) {
    const lines = getLines(context.filePath);
    const maxMatches = args.maxMatches ?? 20;
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, args.caseInsensitive ? 'i' : undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid regular expression';
      return `Could not compile pattern: ${message}`;
    }

    const matches: { line: number; text: string; before: string[]; after: string[] }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!regex.test(lines[i])) {
        continue;
      }
      matches.push({
        line: i + 1,
        text: lines[i],
        before: i > 0 ? [lines[i - 1]] : [],
        after: i + 1 < lines.length ? [lines[i + 1]] : [],
      });
      if (matches.length >= maxMatches) {
        break;
      }
    }

    if (matches.length === 0) {
      return `No lines matched pattern "${args.pattern}".`;
    }

    const truncated = matches.length >= maxMatches
      ? ` Showing the first ${maxMatches} matches.`
      : '';
    const body = matches
      .map((match) => {
        const parts = [
          `Line ${match.line}: ${match.text}`,
        ];
        if (match.before.length > 0) {
          parts.push(`  context before: ${match.before[0]}`);
        }
        if (match.after.length > 0) {
          parts.push(`  context after: ${match.after[0]}`);
        }
        return parts.join('\n');
      })
      .join('\n\n');

    return `Found ${matches.length} match(es) for "${args.pattern}".${truncated}\n\n${body}`;
  },
});
