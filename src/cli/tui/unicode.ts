const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemes(text: string): string[] {
  return [...graphemeSegmenter.segment(text)].map((part) => part.segment);
}

export function firstGrapheme(text: string): string {
  return graphemes(text)[0] ?? ' ';
}

export function isPrintableText(text: string): boolean {
  if (text.length === 0) {
    return false;
  }

  for (const grapheme of graphemes(text)) {
    const code = grapheme.codePointAt(0);
    if (code === undefined) {
      return false;
    }
    if (code < 0x20 || code === 0x7f) {
      return false;
    }
    if (code >= 0x80 && code < 0xa0) {
      return false;
    }
    if (code === 0xfffd) {
      return false;
    }
  }

  return true;
}

export function deleteGraphemeBefore(text: string, cursor: number): { text: string; cursor: number } {
  if (cursor <= 0) {
    return { text, cursor: 0 };
  }

  let pos = 0;
  for (const part of graphemes(text)) {
    const next = pos + part.length;
    if (next >= cursor) {
      return {
        text: `${text.slice(0, pos)}${text.slice(next)}`,
        cursor: pos,
      };
    }
    pos = next;
  }

  return { text, cursor };
}

export function moveCursorByGrapheme(text: string, cursor: number, direction: -1 | 1): number {
  if (direction < 0) {
    if (cursor <= 0) {
      return 0;
    }

    let pos = 0;
    let previous = 0;
    for (const part of graphemes(text)) {
      if (pos >= cursor) {
        return previous;
      }
      previous = pos;
      pos += part.length;
    }
    return previous;
  }

  if (cursor >= text.length) {
    return text.length;
  }

  let pos = 0;
  for (const part of graphemes(text)) {
    const next = pos + part.length;
    if (pos === cursor || (cursor > pos && cursor < next)) {
      return next;
    }
    pos = next;
  }

  return text.length;
}
