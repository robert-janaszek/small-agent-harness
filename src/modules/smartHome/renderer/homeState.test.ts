import { describe, it, expect } from 'vitest';

import { snapshotContextChanges, createContext } from '../context';
import {
  applyContextInit,
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
