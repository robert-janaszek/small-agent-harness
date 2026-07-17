import { describe, it, expect } from 'vitest';

import { getAcState, isAcState, resolveControlGroupKey } from './devices';
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
