import { readFileSync, writeFileSync } from 'node:fs';

export function readFileText(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

export function writeFileText(filePath: string, content: string): void {
  writeFileSync(filePath, content, 'utf8');
}

export function getLines(filePath: string): string[] {
  const text = readFileText(filePath);
  if (text.length === 0) {
    return [];
  }
  // Keep trailing empty line behavior aligned with split: final newline yields empty last slot
  // but for display we prefer logical lines without a phantom empty line after a trailing \n.
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function formatNumberedLines(lines: string[], startLine: number): string {
  const width = String(startLine + lines.length - 1).length;
  return lines
    .map((line, index) => {
      const n = String(startLine + index).padStart(width, ' ');
      return `${n}|${line}`;
    })
    .join('\n');
}

export function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let from = 0;
  while (true) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      break;
    }
    count += 1;
    from = index + needle.length;
  }
  return count;
}

export function replaceExact(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): { ok: true; content: string; replacements: number } | { ok: false; reason: string } {
  const occurrences = countOccurrences(content, oldString);
  if (occurrences === 0) {
    return {
      ok: false,
      reason: 'No exact match for old_string was found in the file.',
    };
  }
  if (!replaceAll && occurrences > 1) {
    return {
      ok: false,
      reason: `Found ${occurrences} matches for old_string. Provide more surrounding context to make it unique, or set replace_all to true.`,
    };
  }

  const next = replaceAll
    ? content.split(oldString).join(newString)
    : content.replace(oldString, newString);

  return {
    ok: true,
    content: next,
    replacements: replaceAll ? occurrences : 1,
  };
}
