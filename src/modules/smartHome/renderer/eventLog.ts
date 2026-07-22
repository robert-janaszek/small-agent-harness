import type { HarnessEvent } from '../../../cli/jsonl';

const MAX_CONTENT_PREVIEW = 56;

function truncate(text: string, max = MAX_CONTENT_PREVIEW): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatToolResult(name: string, content: string): string {
  if (name === 'listDevices') {
    try {
      const parsed = JSON.parse(content) as { devices?: unknown[] };
      const count = parsed.devices?.length ?? 0;
      return `listDevices → ${count} devices`;
    } catch {
      return `listDevices → (invalid json)`;
    }
  }

  return truncate(content.replace(/\s+/g, ' '));
}

export function formatEvent(event: HarnessEvent): string {
  switch (event.type) {
    case 'user_command':
      return `> ${event.command}`;
    case 'assistant_message':
      return `assistant: ${truncate(event.content)}`;
    case 'tool_call':
      return `call ${event.name}(${truncate(JSON.stringify(event.args), 40)})`;
    case 'tool_result':
      return `  ${event.name}: ${formatToolResult(event.name, event.content)}`;
    case 'tokens':
      return `tokens i${event.iteration} ${event.usage.total_tokens} total`;
    case 'context_init':
      return `state init ${event.changes.length} device(s)`;
    case 'context_delta':
      return `state Δ ${event.changes.length} change(s)`;
    case 'agent_response':
      return `agent: ${truncate(event.content)}`;
    case 'ready':
      return `session ready (protocol v${event.protocolVersion})`;
    case 'session_end':
      return `session ended (${event.turnCount} turn(s))`;
    case 'error':
      return `ERROR: ${event.message}`;
    default: {
      const _exhaustive: never = event;
      return String(_exhaustive);
    }
  }
}

export class EventLog {
  private lines: string[] = [];

  append(event: HarnessEvent): void {
    if (event.type === 'context_delta' && event.changes.length === 0) {
      return;
    }
    if (
      (event.type === 'agent_response' || event.type === 'assistant_message') &&
      event.content.trim().length === 0
    ) {
      return;
    }
    this.lines.push(formatEvent(event));
  }

  render(maxLines: number, width: number): string[] {
    if (maxLines <= 0) {
      return [];
    }

    const visible = this.lines.slice(-maxLines);
    return visible.map((line) => truncate(line, width));
  }
}
