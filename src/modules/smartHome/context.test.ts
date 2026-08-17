import { describe, it, expect } from 'vitest';

import { createContext, snapshotHomeState } from './context';
import { setDeviceState } from './devices';

describe('snapshotHomeState', () => {
  it('returns a deep clone of device state', () => {
    const context = createContext();
    setDeviceState(context, { controlGroup: 'light', room: 'livingRoom', deviceId: '1' }, 'OFF');

    const snapshot = snapshotHomeState(context);
    expect(snapshot.light?.livingRoom?.['1']).toBe('OFF');

    setDeviceState(context, { controlGroup: 'light', room: 'livingRoom', deviceId: '1' }, 'ON');
    expect(snapshot.light?.livingRoom?.['1']).toBe('OFF');
  });
});
