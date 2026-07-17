import type { AcState } from '../tools/types';

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ContextDeltaChange = {
  controlGroup: string;
  room: string;
  deviceId: string;
  value: string | AcState;
};

export const HARNESS_PROTOCOL_VERSION = 1;

export type HarnessCommand =
  | { type: 'user_command'; command: string }
  | { type: 'cancel' }
  | { type: 'shutdown' };

export type HarnessEvent =
  | { type: 'ready'; protocolVersion: number }
  | { type: 'user_command'; command: string }
  | { type: 'assistant_message'; content: string }
  | { type: 'tool_call'; name: string; args: unknown; toolCallId: string }
  | { type: 'tool_result'; name: string; content: string; toolCallId: string }
  | { type: 'tokens'; iteration: number; usage: TokenUsage }
  | { type: 'context_delta'; changes: ContextDeltaChange[] }
  | { type: 'agent_response'; content: string; iterations: number; tokenUsage: TokenUsage }
  | { type: 'session_end'; turnCount: number }
  | { type: 'error'; message: string };

export function isHarnessCommand(raw: unknown): raw is HarnessCommand {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
    return false;
  }

  const type = (raw as { type: unknown }).type;
  if (type === 'shutdown' || type === 'cancel') {
    return true;
  }

  if (type === 'user_command') {
    return typeof (raw as { command?: unknown }).command === 'string';
  }

  return false;
}

type EmitWriter = (line: string) => void;

let writer: EmitWriter = (line) => {
  process.stdout.write(line);
};

export function setEmitWriter(nextWriter: EmitWriter): void {
  writer = nextWriter;
}

export function resetEmitWriter(): void {
  writer = (line) => {
    process.stdout.write(line);
  };
}

export function emit(event: HarnessEvent): void {
  writer(`${JSON.stringify(event)}\n`);
}
