import type { HarnessEvent } from './jsonl';
import { setEmitWriter } from './jsonl';

const MAX_SNIPPET = 72;
const MAX_RESULT = 120;
const MAX_AGENT = 240;

function preview(text: string, max = MAX_SNIPPET): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) {
    return oneLine;
  }
  return `${oneLine.slice(0, max - 1)}…`;
}

function formatSnippet(text: string, max = MAX_SNIPPET): string {
  const escaped = text
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/^ +/gm, (spaces) => '·'.repeat(spaces.length))
    .replace(/ +$/gm, (spaces) => '·'.repeat(spaces.length));

  if (escaped.length <= max) {
    return `"${escaped}"`;
  }
  return `"${escaped.slice(0, max - 1)}…"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatToolCall(name: string, args: unknown): string | null {
  switch (name) {
    case 'replace': {
      if (!isRecord(args) || typeof args.old_string !== 'string') {
        return '→ replace ?';
      }
      const suffix = args.replace_all === true ? ' (all)' : '';
      const newPart =
        typeof args.new_string === 'string' ? formatSnippet(args.new_string) : '?';
      return `→ replace ${formatSnippet(args.old_string)} → ${newPart}${suffix}`;
    }
    case 'grep': {
      if (!isRecord(args) || typeof args.pattern !== 'string') {
        return '→ grep ?';
      }
      return `→ grep /${preview(args.pattern, 48)}/`;
    }
    case 'read': {
      if (!isRecord(args) || typeof args.offset !== 'number' || typeof args.limit !== 'number') {
        return '→ read ?';
      }
      const end = args.offset + args.limit - 1;
      return `→ read lines ${args.offset}-${end}`;
    }
    case 'yamlParse':
      return '→ yamlParse';
    default:
      return null;
  }
}

function formatToolResult(name: string, content: string): string {
  if (name === 'yamlParse') {
    const errorMatch = content.match(/\((\d+) error\(s\)\)/);
    if (errorMatch) {
      return `${errorMatch[1]} error(s)`;
    }
    if (content.startsWith('The YAML file parsed successfully')) {
      return 'ok';
    }
  }

  const firstLine = content.split('\n')[0] ?? content;
  return preview(firstLine, MAX_RESULT);
}

export function formatYamlRepairEvent(event: HarnessEvent): string | null {
  switch (event.type) {
    case 'tool_call':
      return formatToolCall(event.name, event.args);
    case 'tool_result':
      return `← ${event.name}: ${formatToolResult(event.name, event.content)}`;
    case 'assistant_message': {
      const text = event.content.trim();
      if (text.length === 0) {
        return null;
      }
      return `assistant: ${preview(text, MAX_AGENT)}`;
    }
    case 'agent_response': {
      const text = event.content.trim();
      if (text.length === 0) {
        return null;
      }
      return `agent: ${preview(text, MAX_AGENT)}`;
    }
    case 'error':
      return `ERROR: ${event.message}`;
    case 'tokens':
    case 'ready':
    case 'user_command':
    case 'context_delta':
    case 'session_end':
      return null;
    default: {
      const _exhaustive: never = event;
      return String(_exhaustive);
    }
  }
}

export function formatYamlRepairEventFromJsonLine(line: string): string | null {
  try {
    const event = JSON.parse(line.trimEnd()) as HarnessEvent;
    return formatYamlRepairEvent(event);
  } catch {
    return null;
  }
}

type LogWriter = (line: string) => void;

/** Swallows JSONL from emit() and prints only human-readable lines. */
export function installYamlRepairLogWriter(log: LogWriter = defaultLogWriter): void {
  setEmitWriter((line) => {
    const formatted = formatYamlRepairEventFromJsonLine(line);
    if (formatted !== null) {
      log(formatted);
    }
  });
}

function defaultLogWriter(line: string): void {
  process.stdout.write(`${line}\n`);
}
