import type { CoreEvent } from '../protocol';

const MAX_CONTENT_PREVIEW = 56;
const MAX_WRAPPED_AGENT_LINES = 10;
const AGENT_PREFIX = 'agent: ';
const ASSISTANT_PREFIX = 'assistant: ';

function truncate(text: string, max = MAX_CONTENT_PREVIEW): string {
  if (max <= 0) {
    return '';
  }
  if (text.length <= max) {
    return text;
  }
  if (max === 1) {
    return '…';
  }
  return `${text.slice(0, max - 1)}…`;
}

function wrapParagraph(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) {
    return [''];
  }

  if (text.length === 0) {
    return [''];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
      continue;
    }

    if (current.length + 1 + word.length <= maxWidth) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.length <= maxWidth) {
      wrapped.push(line);
      continue;
    }

    for (let index = 0; index < line.length; index += maxWidth) {
      wrapped.push(line.slice(index, index + maxWidth));
    }
  }

  return wrapped.length > 0 ? wrapped : [''];
}

export function wrapAgentLine(line: string, width: number): string[] {
  let prefix: string;
  let content: string;

  if (line.startsWith(AGENT_PREFIX)) {
    prefix = AGENT_PREFIX;
    content = line.slice(AGENT_PREFIX.length);
  } else if (line.startsWith(ASSISTANT_PREFIX)) {
    prefix = ASSISTANT_PREFIX;
    content = line.slice(ASSISTANT_PREFIX.length);
  } else {
    return [truncate(line, width)];
  }

  if (width <= 0) {
    return [];
  }

  if (width <= prefix.length) {
    return [truncate(line, width)];
  }

  const indent = ' '.repeat(prefix.length);
  const paragraphs = content.split('\n');
  const result: string[] = [];

  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    const linePrefix = paragraphIndex === 0 && result.length === 0 ? prefix : indent;
    const availableWidth = width - linePrefix.length;
    const wrappedParagraph = wrapParagraph(paragraph, availableWidth);

    for (const [lineIndex, segment] of wrappedParagraph.entries()) {
      const segmentPrefix = lineIndex === 0 && paragraphIndex === 0 && result.length === 0 ? prefix : indent;
      result.push(truncate(`${segmentPrefix}${segment}`, width));
    }
  }

  if (result.length === 0) {
    return [truncate(prefix.trimEnd(), width)];
  }

  return result.length > MAX_WRAPPED_AGENT_LINES ? result.slice(0, MAX_WRAPPED_AGENT_LINES) : result;
}

function isAgentLine(line: string): boolean {
  return line.startsWith(AGENT_PREFIX) || line.startsWith(ASSISTANT_PREFIX);
}

export function formatEvent(event: CoreEvent): string | null {
  switch (event.type) {
    case 'ready':
    case 'session_end':
    case 'tokens':
      return null;
    case 'user_command':
      return `> ${event.command}`;
    case 'assistant_message':
      return event.content.trim().length === 0 ? null : `assistant: ${event.content}`;
    case 'tool_call':
      return `call ${event.name}(${truncate(JSON.stringify(event.args), 40)})`;
    case 'tool_result':
      return `  ${event.name}: ${truncate(event.content.replace(/\s+/g, ' '))}`;
    case 'agent_response':
      return event.content.trim().length === 0 ? null : `agent: ${event.content}`;
    case 'error':
      return `ERROR: ${event.message}`;
    case 'module': {
      if (event.payload === undefined) {
        return `module.${event.module} ${event.event}`;
      }
      return `module.${event.module} ${event.event} ${truncate(JSON.stringify(event.payload), 32)}`;
    }
  }
}

export class EventLog {
  private lines: string[] = [];

  append(event: CoreEvent): void {
    const line = formatEvent(event);
    if (line === null) {
      return;
    }
    this.lines.push(line);
  }

  clear(): void {
    this.lines = [];
  }

  render(maxLines: number, width: number): string[] {
    if (maxLines <= 0) {
      return [];
    }

    const wrappedLines = this.lines.flatMap((line) =>
      isAgentLine(line) ? wrapAgentLine(line, width) : [truncate(line, width)],
    );

    return wrappedLines.slice(-maxLines);
  }
}
