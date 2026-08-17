import { describe, it, expect } from 'vitest';

import { createHomeState, getDeviceValue } from './homeState';

describe('createHomeState', () => {
  it('starts with living room light 1 ON and AC off at 22', () => {
    const state = createHomeState();

    expect(getDeviceValue(state, { controlGroup: 'light', room: 'livingRoom', deviceId: '1' })).toBe('ON');
    expect(getDeviceValue(state, { controlGroup: 'ac', room: 'livingRoom', deviceId: '1' })).toEqual({
      power: 'OFF',
      targetTemperature: 22,
    });
  });
});
