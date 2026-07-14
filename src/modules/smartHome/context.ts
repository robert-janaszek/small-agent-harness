import { emit } from '../../cli/jsonl';
import type { ContextDeltaChange } from '../../cli/jsonl';
import { AcState, ToolContext } from '../../tools/types';
import { initialContext, isAcState, listDeviceEntries, type DeviceRef } from './devices';

function deviceKey({ controlGroup, room, deviceId }: DeviceRef): string {
  return `${controlGroup}/${room}/${deviceId}`;
}

function snapshotContext(context: ToolContext): Map<string, string | AcState> {
  const snapshot = new Map<string, string | AcState>();
  for (const entry of listDeviceEntries(context)) {
    const value = context[entry.controlGroup]?.[entry.room]?.[entry.deviceId];
    if (value === undefined) continue;
    snapshot.set(
      deviceKey(entry),
      isAcState(value) ? structuredClone(value) : value,
    );
  }
  return snapshot;
}

function valuesEqual(a: string | AcState, b: string | AcState): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  if (isAcState(a) && isAcState(b)) {
    return a.power === b.power && a.targetTemperature === b.targetTemperature;
  }
  return false;
}

function parseDeviceKey(key: string): DeviceRef {
  const [controlGroup, room, deviceId] = key.split('/');
  return { controlGroup, room, deviceId };
}

function computeContextDelta(
  previous: Map<string, string | AcState>,
  current: Map<string, string | AcState>,
): ContextDeltaChange[] {
  const changes: ContextDeltaChange[] = [];

  for (const [key, value] of current) {
    const prev = previous.get(key);
    if (prev !== undefined && valuesEqual(prev, value)) {
      continue;
    }

    const ref = parseDeviceKey(key);
    changes.push({
      ...ref,
      value: isAcState(value) ? structuredClone(value) : value,
    });
  }

  return changes;
}

export function createContext(initialState?: ToolContext): ToolContext {
  return structuredClone(initialState ?? initialContext);
}

export function createContextDeltaEmitter(context: ToolContext): () => void {
  let previous = snapshotContext(context);

  return () => {
    const current = snapshotContext(context);
    const changes = computeContextDelta(previous, current);
    previous = current;

    if (changes.length > 0) {
      emit({ type: 'context_delta', changes });
    }
  };
}
