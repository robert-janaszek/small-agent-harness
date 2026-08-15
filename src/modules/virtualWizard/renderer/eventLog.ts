import type { HarnessEvent } from '../../../cli/jsonl';

const MAX_CONTENT_PREVIEW = 56;
const MAX_WRAPPED_AGENT_LINES = 10;
const AGENT_PREFIX = 'agent: ';
const ASSISTANT_PREFIX = 'assistant: ';
const PROMPT_PREFIX = '> ';

function truncate(text: string, max = MAX_CONTENT_PREVIEW): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max === 1) return '…';
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
    const availableWidth = width - (paragraphIndex === 0 && result.length === 0 ? prefix.length : indent.length);
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

function wrapPromptLine(line: string, width: number): string[] {
  if (!line.startsWith(PROMPT_PREFIX) || width <= PROMPT_PREFIX.length) {
    return [truncate(line, width)];
  }

  const content = line.slice(PROMPT_PREFIX.length);
  const wrapped = wrapParagraph(content, width - PROMPT_PREFIX.length);
  return wrapped.map((segment, index) =>
    truncate(`${index === 0 ? PROMPT_PREFIX : '  '}${segment}`, width),
  );
}

function isAgentLine(line: string): boolean {
  return line.startsWith(AGENT_PREFIX) || line.startsWith(ASSISTANT_PREFIX);
}

function isPromptLine(line: string): boolean {
  return line.startsWith(PROMPT_PREFIX);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatToolCall(name: string, args: unknown): string {
  if (name === 'validateCurrentStep' && isRecord(args)) {
    const parts = Object.entries(args)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${String(value)}`);
    if (parts.length > 0) {
      return `→ ${name} ${truncate(parts.join(' '), 40)}`;
    }
  }

  return `→ ${name}`;
}

export function formatVirtualWizardEvent(event: HarnessEvent): string | null {
  switch (event.type) {
    case 'user_command':
      return `> ${event.command}`;
    case 'assistant_message': {
      const text = event.content.trim();
      return text.length === 0 ? null : `assistant: ${text}`;
    }
    case 'tool_call':
      return formatToolCall(event.name, event.args);
    case 'tool_result': {
      const firstLine = event.content.split('\n')[0] ?? event.content;
      return `← ${event.name}: ${truncate(firstLine.replace(/\s+/g, ' '))}`;
    }
    case 'agent_response': {
      const text = event.content.trim();
      return text.length === 0 ? null : `agent: ${text}`;
    }
    case 'error':
      return `ERROR: ${event.message}`;
    case 'tokens':
    case 'ready':
    case 'context_init':
    case 'context_delta':
    case 'wizard_state':
    case 'work_file':
    case 'session_end':
      return null;
    default: {
      const _exhaustive: never = event;
      return String(_exhaustive);
    }
  }
}

export class EventLog {
  private lines: string[] = [];

  append(event: HarnessEvent): void {
    const formatted = formatVirtualWizardEvent(event);
    if (formatted === null) {
      return;
    }

    this.lines.push(formatted);
  }

  clear(): void {
    this.lines = [];
  }

  render(maxLines: number, width: number): string[] {
    if (maxLines <= 0) {
      return [];
    }

    const wrappedLines = this.lines.flatMap((line) => {
      if (isAgentLine(line)) {
        return wrapAgentLine(line, width);
      }
      if (isPromptLine(line)) {
        return wrapPromptLine(line, width);
      }
      return [truncate(line, width)];
    });

    return wrappedLines.slice(-maxLines);
  }
}
