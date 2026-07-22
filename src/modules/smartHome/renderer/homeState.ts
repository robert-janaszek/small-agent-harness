import type { ContextDeltaChange, HarnessEvent } from '../../../cli/jsonl';
import { AcState, ToolContext } from '../../../tools/types';
import { initialContext, isAcState } from '../devices';

export function createEmptyHomeState(): ToolContext {
  return {};
}

export function createHomeState(): ToolContext {
  return structuredClone(initialContext);
}

function writeChange(context: ToolContext, change: ContextDeltaChange): void {
  if (!context[change.controlGroup]) {
    context[change.controlGroup] = {};
  }

  const controlGroup = context[change.controlGroup]!;
  if (!controlGroup[change.room]) {
    controlGroup[change.room] = {};
  }

  const roomDevices = controlGroup[change.room]!;
  if (isAcState(change.value)) {
    roomDevices[change.deviceId] = structuredClone(change.value) as AcState;
  } else {
    roomDevices[change.deviceId] = change.value;
  }
}

export function homeStateFromChanges(changes: ContextDeltaChange[]): ToolContext {
  const context: ToolContext = {};

  for (const change of changes) {
    writeChange(context, change);
  }

  return context;
}

export function applyContextInit(context: ToolContext, changes: ContextDeltaChange[]): void {
  for (const controlGroup of Object.keys(context)) {
    delete context[controlGroup];
  }

  Object.assign(context, homeStateFromChanges(changes));
}

export function applyContextDelta(context: ToolContext, changes: ContextDeltaChange[]): void {
  for (const change of changes) {
    writeChange(context, change);
  }
}

export function applyHomeStateEvent(context: ToolContext, event: HarnessEvent): boolean {
  if (event.type === 'context_init') {
    applyContextInit(context, event.changes);
    return true;
  }

  if (event.type === 'context_delta') {
    applyContextDelta(context, event.changes);
    return true;
  }

  return false;
}

export function getDeviceValue(
  context: ToolContext,
  ref: { controlGroup: string; room: string; deviceId: string },
): string | AcState | undefined {
  return context[ref.controlGroup]?.[ref.room]?.[ref.deviceId];
}
