import { describe, it, expect, afterEach } from 'vitest';

import { resetEmitWriter, setEmitWriter } from '../../cli/jsonl';
import { createContext, createContextDeltaEmitter, emitContextInit, snapshotContextChanges } from './context';
import { setAcPower, setDeviceState } from './devices';

describe('createContextDeltaEmitter', () => {
  afterEach(() => {
    resetEmitWriter();
  });

  it('emits only devices that changed since the previous round', () => {
    const context = createContext();
    const lines: string[] = [];
    setEmitWriter((line) => lines.push(line));

    const emitDelta = createContextDeltaEmitter(context);
    emitDelta();
    expect(lines).toHaveLength(0);

    setDeviceState(context, { controlGroup: 'light', room: 'livingRoom', deviceId: '1' }, 'OFF');
    emitDelta();

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].trimEnd())).toEqual({
      type: 'context_delta',
      changes: [
        {
          controlGroup: 'light',
          room: 'livingRoom',
          deviceId: '1',
          value: 'OFF',
        },
      ],
    });
  });

  it('emits AC state as an object value', () => {
    const context = createContext();
    const lines: string[] = [];
    setEmitWriter((line) => lines.push(line));

    const emitDelta = createContextDeltaEmitter(context);
    setAcPower(context, { room: 'livingRoom', deviceId: '1' }, 'ON');
    emitDelta();

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].trimEnd())).toEqual({
      type: 'context_delta',
      changes: [
        {
          controlGroup: 'ac',
          room: 'livingRoom',
          deviceId: '1',
          value: { power: 'ON', targetTemperature: 22 },
        },
      ],
    });
  });

  it('does not emit when no devices changed', () => {
    const context = createContext();
    const lines: string[] = [];
    setEmitWriter((line) => lines.push(line));

    const emitDelta = createContextDeltaEmitter(context);
    emitDelta();
    emitDelta();

    expect(lines).toHaveLength(0);
  });
});

describe('emitContextInit', () => {
  afterEach(() => {
    resetEmitWriter();
  });

  it('emits the full device snapshot as context_init', () => {
    const context = createContext();
    const lines: string[] = [];
    setEmitWriter((line) => lines.push(line));

    emitContextInit(context);

    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0].trimEnd());
    expect(event.type).toBe('context_init');
    expect(event.changes).toEqual(snapshotContextChanges(context));
    expect(event.changes.length).toBeGreaterThan(0);
  });

  it('includes custom initial state in context_init', () => {
    const context = createContext();
    setDeviceState(context, { controlGroup: 'light', room: 'livingRoom', deviceId: '1' }, 'OFF');

    const lines: string[] = [];
    setEmitWriter((line) => lines.push(line));
    emitContextInit(context);

    const event = JSON.parse(lines[0].trimEnd());
    expect(event.changes).toContainEqual({
      controlGroup: 'light',
      room: 'livingRoom',
      deviceId: '1',
      value: 'OFF',
    });
  });
});
