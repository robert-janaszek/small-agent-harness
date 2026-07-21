import { describe, it, expect } from 'vitest';

import {
  formatDeviceValue,
  getAcState,
  getDevicePower,
  getDeviceState,
  initialContext,
  isAcState,
  listDeviceEntries,
  normalizeDeviceRef,
  resetContext,
  resolveControlGroupKey,
  setAcPower,
  setAcTemperature,
  setDeviceState,
} from './devices';
import { createContext } from './context';

describe('resolveControlGroupKey', () => {
  const context = createContext();

  it('resolves canonical and alias control groups case-insensitively', () => {
    expect(resolveControlGroupKey(context, 'ac')).toBe('ac');
    expect(resolveControlGroupKey(context, 'AC')).toBe('ac');
    expect(resolveControlGroupKey(context, 'tv')).toBe('TV');
    expect(resolveControlGroupKey(context, 'waterValve')).toBe('waterValve');
    expect(resolveControlGroupKey(context, 'WATERVALVE')).toBe('waterValve');
  });

  it('returns undefined for unknown control groups', () => {
    expect(resolveControlGroupKey(context, 'kitchen')).toBeUndefined();
  });
});

describe('isAcState', () => {
  it('accepts valid AC state', () => {
    expect(isAcState({ power: 'ON', targetTemperature: 22 })).toBe(true);
  });

  it('rejects invalid power values', () => {
    expect(isAcState({ power: 'MAYBE', targetTemperature: 22 })).toBe(false);
  });

  it('rejects non-number temperature', () => {
    expect(isAcState({ power: 'ON', targetTemperature: 'hot' })).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(isAcState({ power: 'ON' })).toBe(false);
    expect(isAcState(null)).toBe(false);
  });
});

describe('getAcState', () => {
  it('ignores malformed AC entries in context', () => {
    const context = createContext();
    context.ac.livingRoom['1'] = { power: 'MAYBE', targetTemperature: 'hot' } as unknown as typeof context.ac.livingRoom['1'];

    expect(getAcState(context, { room: 'livingRoom', deviceId: '1' })).toBeUndefined();
  });
});

describe('normalizeDeviceRef', () => {
  it('resolves control group case-insensitively', () => {
    const context = createContext();

    expect(
      normalizeDeviceRef(context, {
        controlGroup: 'TV',
        room: 'livingRoom',
        deviceId: '1',
      }),
    ).toEqual({
      controlGroup: 'TV',
      room: 'livingRoom',
      deviceId: '1',
    });
  });

  it('returns null for unknown control groups', () => {
    const context = createContext();

    expect(
      normalizeDeviceRef(context, {
        controlGroup: 'kitchen',
        room: 'livingRoom',
        deviceId: '1',
      }),
    ).toBeNull();
  });
});

describe('getDeviceState and setDeviceState', () => {
  it('reads and updates string device state', () => {
    const context = createContext();

    expect(
      getDeviceState(context, {
        controlGroup: 'light',
        room: 'livingRoom',
        deviceId: '1',
      }),
    ).toBe('ON');

    expect(
      setDeviceState(context, {
        controlGroup: 'light',
        room: 'livingRoom',
        deviceId: '1',
      }, 'OFF'),
    ).toBe(true);
    expect(
      getDeviceState(context, {
        controlGroup: 'light',
        room: 'livingRoom',
        deviceId: '1',
      }),
    ).toBe('OFF');
  });

  it('returns undefined and false for unknown refs', () => {
    const context = createContext();

    expect(
      getDeviceState(context, {
        controlGroup: 'light',
        room: 'attic',
        deviceId: '1',
      }),
    ).toBeUndefined();
    expect(
      setDeviceState(context, {
        controlGroup: 'light',
        room: 'attic',
        deviceId: '1',
      }, 'OFF'),
    ).toBe(false);
  });

  it('does not treat AC entries as string devices', () => {
    const context = createContext();

    expect(
      getDeviceState(context, {
        controlGroup: 'ac',
        room: 'livingRoom',
        deviceId: '1',
      }),
    ).toBeUndefined();
    expect(
      setDeviceState(context, {
        controlGroup: 'ac',
        room: 'livingRoom',
        deviceId: '1',
      }, 'ON'),
    ).toBe(false);
  });
});

describe('setAcPower and setAcTemperature', () => {
  it('updates AC power and target temperature', () => {
    const context = createContext();
    const ref = { room: 'livingRoom', deviceId: '1' };

    expect(setAcPower(context, ref, 'ON')).toBe(true);
    expect(getAcState(context, ref)).toEqual({ power: 'ON', targetTemperature: 22 });

    expect(setAcTemperature(context, ref, 24)).toBe(true);
    expect(getAcState(context, ref)).toEqual({ power: 'ON', targetTemperature: 24 });
  });

  it('returns false when AC device is missing', () => {
    const context = createContext();

    expect(setAcPower(context, { room: 'bedroom', deviceId: '1' }, 'ON')).toBe(false);
    expect(setAcTemperature(context, { room: 'bedroom', deviceId: '1' }, 20)).toBe(false);
  });
});

describe('formatDeviceValue and getDevicePower', () => {
  it('formats AC and string device values', () => {
    expect(formatDeviceValue('ON')).toBe('ON');
    expect(formatDeviceValue({ power: 'OFF', targetTemperature: 22 })).toBe(
      'OFF, target 22°C',
    );
  });

  it('extracts power from string and AC values', () => {
    expect(getDevicePower('OFF')).toBe('OFF');
    expect(getDevicePower({ power: 'ON', targetTemperature: 18 })).toBe('ON');
  });
});

describe('listDeviceEntries', () => {
  it('returns all devices by default', () => {
    const context = createContext();
    const entries = listDeviceEntries(context);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((entry) => entry.controlGroup === 'ac')).toBe(true);
  });

  it('filters by control group, room, and power state', () => {
    const context = createContext();

    expect(
      listDeviceEntries(context, {
        controlGroup: 'tv',
        room: 'livingRoom',
        stateFilter: 'OFF',
      }),
    ).toEqual([
      {
        controlGroup: 'TV',
        room: 'livingRoom',
        deviceId: '1',
        value: 'OFF',
      },
    ]);
  });

  it('returns empty list for unknown control group filter', () => {
    const context = createContext();

    expect(listDeviceEntries(context, { controlGroup: 'kitchen' })).toEqual([]);
  });

  it('clones AC state values', () => {
    const context = createContext();
    const [entry] = listDeviceEntries(context, { controlGroup: 'ac' });

    expect(entry.value).toEqual({ power: 'OFF', targetTemperature: 22 });
    expect(entry.value).not.toBe(context.ac.livingRoom['1']);
  });
});

describe('resetContext', () => {
  it('restores the initial smart home state', () => {
    const context = createContext();

    setDeviceState(context, {
      controlGroup: 'light',
      room: 'livingRoom',
      deviceId: '1',
    }, 'OFF');
    context.extra = { attic: { lamp: 'ON' } };

    resetContext(context);

    expect(context).toEqual(initialContext);
    expect(context.light.livingRoom['1']).toBe('ON');
    expect('extra' in context).toBe(false);
  });
});
