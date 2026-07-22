import { describe, it, expect } from 'vitest';

import { snapshotContextChanges, createContext } from '../context';
import {
  applyContextDelta,
  applyContextInit,
  applyHomeStateEvent,
  createEmptyHomeState,
  createHomeState,
  homeStateFromChanges,
} from './homeState';

describe('homeStateFromChanges', () => {
  it('builds a full context from context_init changes', () => {
    const source = createContext();
    const built = homeStateFromChanges(snapshotContextChanges(source));

    expect(built).toEqual(source);
  });
});

describe('applyContextInit', () => {
  it('replaces the entire client state', () => {
    const context = createEmptyHomeState();
    applyContextInit(context, [
      { controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' },
      { controlGroup: 'light', room: 'livingRoom', deviceId: '2', value: 'ON' },
    ]);

    expect(context).toEqual({
      light: {
        livingRoom: {
          '1': 'OFF',
          '2': 'ON',
        },
      },
    });
  });

  it('clears stale devices from a previous snapshot', () => {
    const context = createHomeState();
    applyContextInit(context, [
      { controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' },
    ]);

    expect(context).toEqual({
      light: {
        livingRoom: {
          '1': 'OFF',
        },
      },
    });
  });
});

describe('applyContextDelta', () => {
  it('upserts devices that are missing from the current state', () => {
    const context = createEmptyHomeState();
    applyContextDelta(context, [
      { controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' },
    ]);

    expect(context).toEqual({
      light: {
        livingRoom: {
          '1': 'OFF',
        },
      },
    });
  });
});

describe('applyHomeStateEvent', () => {
  it('applies context_init by replacing state', () => {
    const context = createHomeState();

    expect(
      applyHomeStateEvent(context, {
        type: 'context_init',
        changes: [{ controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' }],
      }),
    ).toBe(true);

    expect(context).toEqual({
      light: {
        livingRoom: {
          '1': 'OFF',
        },
      },
    });
  });

  it('applies context_delta updates in place', () => {
    const context = createHomeState();

    expect(
      applyHomeStateEvent(context, {
        type: 'context_delta',
        changes: [{ controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' }],
      }),
    ).toBe(true);

    expect(context.light?.livingRoom?.['1']).toBe('OFF');
    expect(context.light?.livingRoom?.['2']).toBe('ON');
  });

  it('ignores unrelated events', () => {
    const context = createHomeState();
    const before = structuredClone(context);

    expect(applyHomeStateEvent(context, { type: 'ready', protocolVersion: 1 })).toBe(false);
    expect(context).toEqual(before);
  });
});
