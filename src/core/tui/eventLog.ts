import type { CoreEvent } from '../protocol';
import type { ToolActivity } from '../tool';
import { colors } from './colors';
import type { TrueColor } from './diffTerminal';
import { formatToolActivity } from './toolActivity';

const MAX_CONTENT_PREVIEW = 56;
const MAX_WRAPPED_AGENT_LINES = 10;
const AGENT_PREFIX = 'agent: ';
const ASSISTANT_PREFIX = 'assistant: ';
const THINK_PREFIX = 'think: ';

export type LogLine = {
  text: string;
  fg?: number;
  trueColorFg?: TrueColor;
};

export function formatThoughtDuration(elapsedMs: number): string {
  const seconds = Math.max(1, Math.round(Math.max(0, elapsedMs) / 1000));
  return seconds === 1 ? 'thought for 1 second' : `thought for ${seconds} seconds`;
}

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
  } else if (line.startsWith(THINK_PREFIX)) {
    prefix = THINK_PREFIX;
    content = line.slice(THINK_PREFIX.length);
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

function isWrappableLogLine(line: string): boolean {
  return line.startsWith(AGENT_PREFIX) || line.startsWith(ASSISTANT_PREFIX) || line.startsWith(THINK_PREFIX);
}

function lineBody(line: string, prefix: string): string {
  return line.startsWith(prefix) ? line.slice(prefix.length) : line;
}

function hasVisibleAgentText(line: string): boolean {
  if (line.startsWith(AGENT_PREFIX)) {
    return line.slice(AGENT_PREFIX.length).trim().length > 0;
  }
  if (line.startsWith(ASSISTANT_PREFIX)) {
    return line.slice(ASSISTANT_PREFIX.length).trim().length > 0;
  }
  if (line.startsWith(THINK_PREFIX)) {
    return line.slice(THINK_PREFIX.length).trim().length > 0;
  }
  return line.trim().length > 0;
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
  tone?: 'default' | 'thinking';
  startedAt?: number;
  thinkingBody?: string;
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

function isReasoningFallback(entry: TextLogEntry, agentLine: string): boolean {
  if (entry.tone !== 'thinking') {
    return false;
  }
  const body = entry.thinkingBody ?? lineBody(entry.line, THINK_PREFIX);
  const agentBody = lineBody(agentLine, AGENT_PREFIX);
  return normalizeThought(body) === normalizeThought(agentBody);
}

function normalizeThought(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

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

  append(event: CoreEvent, now = Date.now()): void {
    if (event.type === 'agent_response') {
      this.finalizeThinking(now);
      this.failPendingTools();
      const last = this.entries.at(-1);
      if (last?.kind === 'text' && last.streaming) {
        const line = formatEvent(event, this.activities);
        last.streaming = false;
        if (line === null) {
          if (!hasVisibleAgentText(last.line)) {
            this.entries.pop();
          }
        } else if (isReasoningFallback(last, line)) {
          return;
        } else {
          last.line = line;
        }
        return;
      }

      const line = formatEvent(event, this.activities);
      if (line === null) {
        return;
      }
      const previous = this.entries.at(-1);
      if (previous?.kind === 'text' && isReasoningFallback(previous, line)) {
        return;
      }
      this.entries.push({ kind: 'text', line });
      return;
    }

    if (event.type === 'assistant_message' || event.type === 'tool_call' || event.type === 'error') {
      this.cancelStreaming(now);
    }

    if (event.type === 'error') {
      this.failPendingTools();
    }

    if (event.type === 'tool_call') {
      const existing = this.entries.find(
        (item): item is ToolLogEntry => item.kind === 'tool' && item.toolCallId === event.toolCallId,
      );
      if (existing) {
        existing.name = event.name;
        existing.args = event.args;
        existing.done = false;
        existing.failed = false;
        return;
      }

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

  appendDelta(delta: string, now = Date.now()): void {
    this.finalizeThinking(now);
    this.appendStreamingDelta(delta, AGENT_PREFIX, 'default', now);
  }

  appendReasoningDelta(delta: string, now = Date.now()): void {
    this.appendStreamingDelta(delta, THINK_PREFIX, 'thinking', now);
  }

  cancelStreaming(now = Date.now()): void {
    this.finalizeThinking(now);
    const last = this.entries.at(-1);
    if (last?.kind === 'text' && last.streaming && last.tone !== 'thinking') {
      this.entries.pop();
    }
  }

  clear(): void {
    this.entries = [];
  }

  render(maxLines: number, width: number): string[] {
    return this.renderLines(maxLines, width).map((line) => line.text);
  }

  renderLines(maxLines: number, width: number): LogLine[] {
    if (maxLines <= 0) {
      return [];
    }

    const wrappedLines = this.entries.flatMap((entry) => {
      const line = formatLogEntry(entry, this.activities);
      const trueColorFg = entry.kind === 'text' && entry.tone === 'thinking' ? colors.thinking : undefined;
      const wrapped = isWrappableLogLine(line) ? wrapAgentLine(line, width) : wrapPlainLine(line, width);
      return wrapped.map((text) => (trueColorFg === undefined ? { text } : { text, trueColorFg }));
    });

    return wrappedLines.slice(-maxLines);
  }

  private failPendingTools(): void {
    for (const entry of this.entries) {
      if (entry.kind === 'tool' && !entry.done) {
        entry.done = true;
        entry.failed = true;
      }
    }
  }

  private appendStreamingDelta(
    delta: string,
    prefix: string,
    tone: 'default' | 'thinking',
    now: number,
  ): void {
    if (delta.length === 0) {
      return;
    }

    const last = this.entries.at(-1);
    if (last?.kind === 'text' && last.streaming && (last.tone ?? 'default') === tone) {
      last.line += delta;
      return;
    }

    if (delta.trim().length === 0) {
      return;
    }

    this.entries.push({
      kind: 'text',
      line: `${prefix}${delta}`,
      streaming: true,
      tone,
      ...(tone === 'thinking' ? { startedAt: now } : {}),
    });
  }

  private finalizeThinking(now: number): void {
    const last = this.entries.at(-1);
    if (last?.kind !== 'text' || !last.streaming || last.tone !== 'thinking') {
      return;
    }

    if (!hasVisibleAgentText(last.line)) {
      this.entries.pop();
      return;
    }

    last.thinkingBody = lineBody(last.line, THINK_PREFIX);
    last.line = formatThoughtDuration(now - (last.startedAt ?? now));
    last.streaming = false;
  }
}
