import type { ContextDeltaChange } from '../../../cli/jsonl';
import { AcState, ToolContext } from '../../../tools/types';
import { initialContext, isAcState } from '../devices';

export function createEmptyHomeState(): ToolContext {
  return {};
}

export function createHomeState(): ToolContext {
  return structuredClone(initialContext);
}

export function homeStateFromChanges(changes: ContextDeltaChange[]): ToolContext {
  const context: ToolContext = {};

  for (const change of changes) {
    if (!context[change.controlGroup]) {
      context[change.controlGroup] = {};
    }

    const controlGroup = context[change.controlGroup]!;
    if (!controlGroup[change.room]) {
      controlGroup[change.room] = {};
    }

    const roomDevices = controlGroup[change.room]!;
    if (isAcState(change.value)) {
      roomDevices[change.deviceId] = structuredClone(change.value);
    } else {
      roomDevices[change.deviceId] = change.value;
    }
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
    const roomDevices = context[change.controlGroup]?.[change.room];
    if (!roomDevices || !(change.deviceId in roomDevices)) continue;

    if (isAcState(change.value)) {
      roomDevices[change.deviceId] = structuredClone(change.value) as AcState;
    } else {
      roomDevices[change.deviceId] = change.value;
    }
  }
}

export function getDeviceValue(
  context: ToolContext,
  ref: { controlGroup: string; room: string; deviceId: string },
): string | AcState | undefined {
  return context[ref.controlGroup]?.[ref.room]?.[ref.deviceId];
}
