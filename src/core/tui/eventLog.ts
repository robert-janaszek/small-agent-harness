import type { CoreEvent } from '../protocol';
import type { ToolActivity } from '../tool';
import { formatToolActivity } from './toolActivity';

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

function trimEdgeEmptyParagraphs(paragraphs: string[]): string[] {
  let start = 0;
  let end = paragraphs.length;

  while (start < end && paragraphs[start]!.trim().length === 0) {
    start += 1;
  }
  while (end > start && paragraphs[end - 1]!.trim().length === 0) {
    end -= 1;
  }

  return paragraphs.slice(start, end);
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

  if (content.trim().length === 0) {
    return [];
  }

  if (width <= 0) {
    return [];
  }

  if (width <= prefix.length) {
    return [truncate(line, width)];
  }

  const indent = ' '.repeat(prefix.length);
  const paragraphs = trimEdgeEmptyParagraphs(content.split('\n'));
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

  return result.length > MAX_WRAPPED_AGENT_LINES ? result.slice(0, MAX_WRAPPED_AGENT_LINES) : result;
}

function isAgentLine(line: string): boolean {
  return line.startsWith(AGENT_PREFIX) || line.startsWith(ASSISTANT_PREFIX);
}

export function wrapPlainLine(line: string, width: number): string[] {
  if (width <= 0) {
    return [];
  }

  const result: string[] = [];
  for (const paragraph of line.split('\n')) {
    result.push(...wrapParagraph(paragraph, width).map((segment) => truncate(segment, width)));
  }
  return result.length > 0 ? result : [''];
}

export function formatEvent(
  event: CoreEvent,
  activities: ReadonlyMap<string, ToolActivity> = new Map(),
): string | null {
  switch (event.type) {
    case 'ready':
    case 'session_end':
    case 'tokens':
      return null;
    case 'user_command':
      return `> ${event.command.replace(/\s+/g, ' ').trim()}`;
    case 'assistant_message':
      return event.content.trim().length === 0 ? null : `assistant: ${event.content}`;
    case 'tool_call':
      return formatToolActivity(event.name, event.args, 'running', activities.get(event.name));
    case 'tool_result':
      return null;
    case 'agent_response':
      return event.content.trim().length === 0 ? null : `agent: ${event.content}`;
    case 'error':
      return `ERROR: ${event.message}`;
    case 'module': {
      if (event.event === 'state') {
        return null;
      }
      if (event.payload === undefined) {
        return `module.${event.module} ${event.event}`;
      }
      return `module.${event.module} ${event.event} ${truncate(JSON.stringify(event.payload), 32)}`;
    }
  }
}

type TextLogEntry = {
  kind: 'text';
  line: string;
  streaming?: boolean;
};

type ToolLogEntry = {
  kind: 'tool';
  toolCallId: string;
  name: string;
  args: unknown;
  done: boolean;
  failed: boolean;
};

type LogEntry = TextLogEntry | ToolLogEntry;

function formatLogEntry(entry: LogEntry, activities: ReadonlyMap<string, ToolActivity>): string {
  if (entry.kind === 'tool') {
    const status = !entry.done ? 'running' : entry.failed ? 'failed' : 'done';
    return formatToolActivity(entry.name, entry.args, status, activities.get(entry.name));
  }
  return entry.line;
}

export class EventLog {
  private entries: LogEntry[] = [];

  constructor(private readonly activities: ReadonlyMap<string, ToolActivity> = new Map()) {}

  append(event: CoreEvent): void {
    if (event.type === 'agent_response') {
      const last = this.entries.at(-1);
      if (last?.kind === 'text' && last.streaming) {
        const line = formatEvent(event, this.activities);
        last.streaming = false;
        if (line === null) {
          this.entries.pop();
        } else {
          last.line = line;
        }
        return;
      }
    }

    if (event.type === 'assistant_message' || event.type === 'tool_call') {
      this.cancelStreaming();
    }

    if (event.type === 'tool_call') {
      this.entries.push({
        kind: 'tool',
        toolCallId: event.toolCallId,
        name: event.name,
        args: event.args,
        done: false,
        failed: false,
      });
      return;
    }

    if (event.type === 'tool_result') {
      const entry = this.entries.find(
        (item): item is ToolLogEntry => item.kind === 'tool' && item.toolCallId === event.toolCallId,
      );
      if (entry) {
        entry.done = true;
        entry.failed = event.failed === true;
      }
      return;
    }

    const line = formatEvent(event, this.activities);
    if (line === null) {
      return;
    }
    this.entries.push({ kind: 'text', line });
  }

  appendDelta(delta: string): void {
    if (delta.length === 0) {
      return;
    }

    const last = this.entries.at(-1);
    if (last?.kind === 'text' && last.streaming) {
      last.line += delta;
      return;
    }

    if (delta.trim().length === 0) {
      return;
    }

    this.entries.push({ kind: 'text', line: `${AGENT_PREFIX}${delta}`, streaming: true });
  }

  cancelStreaming(): void {
    const last = this.entries.at(-1);
    if (last?.kind === 'text' && last.streaming) {
      this.entries.pop();
    }
  }

  clear(): void {
    this.entries = [];
  }

  render(maxLines: number, width: number): string[] {
    if (maxLines <= 0) {
      return [];
    }

    const wrappedLines = this.entries.flatMap((entry) => {
      const line = formatLogEntry(entry, this.activities);
      return isAgentLine(line) ? wrapAgentLine(line, width) : wrapPlainLine(line, width);
    });

    return wrappedLines.slice(-maxLines);
  }
}
