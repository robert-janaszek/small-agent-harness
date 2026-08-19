export const CORE_PROTOCOL_VERSION = 1;

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type CoreCommand =
  | { type: 'user_command'; command: string }
  | { type: 'cancel' }
  | { type: 'shutdown' }
  | { type: 'reset' };

export type ModuleEvent = {
  type: 'module';
  module: string;
  event: string;
  payload?: unknown;
};

export type CoreEvent =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'user_command'; command: string }
  | { type: 'assistant_message'; content: string }
  | { type: 'tool_call'; name: string; args: unknown; toolCallId: string }
  | { type: 'tool_result'; name: string; content: string; toolCallId: string; failed?: true }
  | { type: 'tokens'; iteration: number; usage: TokenUsage }
  | { type: 'agent_response'; content: string; iterations: number; tokenUsage: TokenUsage }
  | { type: 'session_end'; turnCount: number }
  | { type: 'error'; message: string }
  | ModuleEvent;

export type EmitFn = (event: CoreEvent) => void;

export function isCoreCommand(raw: unknown): raw is CoreCommand {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
    return false;
  }

  const type = (raw as { type: unknown }).type;
  if (type === 'shutdown' || type === 'cancel' || type === 'reset') {
    return true;
  }

  if (type === 'user_command') {
    return typeof (raw as { command?: unknown }).command === 'string';
  }

  return false;
}

export function isModuleEvent(raw: unknown): raw is ModuleEvent {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
    return false;
  }

  const event = raw as { type: unknown; module?: unknown; event?: unknown };
  return event.type === 'module' && typeof event.module === 'string' && typeof event.event === 'string';
}

export function encodeEvent(event: CoreEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseCommandLine(line: string): CoreCommand | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const raw: unknown = JSON.parse(trimmed);
    return isCoreCommand(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function createStdoutEmit(write: (line: string) => void = (line) => process.stdout.write(line)): EmitFn {
  return (event) => {
    write(encodeEvent(event));
  };
}
