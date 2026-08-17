import { AcState, ToolContext } from '../../../tools/types';
import { initialContext } from '../devices';

export function createHomeState(): ToolContext {
  return structuredClone(initialContext);
}

export function getDeviceValue(
  context: ToolContext,
  ref: { controlGroup: string; room: string; deviceId: string },
): string | AcState | undefined {
  return context[ref.controlGroup]?.[ref.room]?.[ref.deviceId];
}
