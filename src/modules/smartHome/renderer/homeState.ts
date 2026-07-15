import type { ContextDeltaChange } from '../../../cli/jsonl';
import { AcState, ToolContext } from '../../../tools/types';
import { initialContext, isAcState } from '../devices';

export function createHomeState(): ToolContext {
  return structuredClone(initialContext);
}

export function applyContextDelta(context: ToolContext, changes: ContextDeltaChange[]): void {
  for (const change of changes) {
    const roomDevices = context[change.controlGroup]?.[change.room];
    if (!roomDevices || !(change.deviceId in roomDevices)) continue;

    if (isAcState(change.value)) {
      roomDevices[change.deviceId] = structuredClone(change.value);
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
