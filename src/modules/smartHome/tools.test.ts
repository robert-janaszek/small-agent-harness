import { describe, it, expect, beforeEach } from 'vitest';
import { context } from './context';
import { listDevices } from './listDevices.tool';
import { getDeviceStatus } from './getDeviceStatus.tool';
import { controlDevice } from './controlDevice.tool';
import { controlAllDevicesInRoom } from './controlAllDevicesInRoom.tool';
import { getDeviceState, initialContext, resetContext } from './devices';

beforeEach(() => {
  resetContext(context);
});

describe('listDevices', () => {
  const tool = listDevices(context);

  it('returns all devices when no filter is given', async () => {
    const result = await tool.call({});
    expect(result).toContain('light / livingRoom / 1: ON');
    expect(result).toContain('light / livingRoom / 2: ON');
    expect(result).toContain('light / livingRoom / 3: ON');
    expect(result).toContain('light / bathroom / 1: ON');
  });

  it('filters by ON state', async () => {
    const result = await tool.call({ stateFilter: 'ON' });
    expect(result).toContain('light / livingRoom / 1');
    expect(result.split('\n')).toHaveLength(4);
  });

  it('filters by OFF state', async () => {
    const result = await tool.call({ stateFilter: 'OFF' });
    expect(result).toBe('');
  });

  it('filters by controlGroup and room', async () => {
    const result = await tool.call({ controlGroup: 'light', room: 'livingRoom' });
    expect(result).toBe(
      'light / livingRoom / 1: ON\nlight / livingRoom / 2: ON\nlight / livingRoom / 3: ON',
    );
  });

  it('filters by controlGroup, room and state', async () => {
    context.light.livingRoom['1'] = 'OFF';
    const result = await tool.call({ controlGroup: 'light', room: 'livingRoom', stateFilter: 'ON' });
    expect(result).toBe('light / livingRoom / 2: ON\nlight / livingRoom / 3: ON');
  });

  it('has correct function name and description', () => {
    expect(tool.function.name).toBe('listDevices');
    expect(tool.function.description).toBeTruthy();
  });
});

describe('getDeviceStatus', () => {
  const tool = getDeviceStatus(context);

  it('returns status for an existing device', async () => {
    const result = await tool.call({ controlGroup: 'light', room: 'livingRoom', deviceId: '1' });
    expect(result).toBe('ON');
  });

  it('returns error for unknown device with available devices listed', async () => {
    const result = await tool.call({ controlGroup: 'light', room: 'kitchen', deviceId: '1' });
    expect(result).toContain('Error');
    expect(result).toContain('light / livingRoom / 1');
  });

  it('has correct function name', () => {
    expect(tool.function.name).toBe('getDeviceStatus');
  });
});

describe('controlDevice', () => {
  const tool = controlDevice(context);

  it('turns a device off', async () => {
    const result = await tool.call({
      controlGroup: 'light',
      room: 'livingRoom',
      deviceId: '1',
      action: 'turn_off',
    });
    expect(result).toBe('Device light / livingRoom / 1 turned off');
    expect(getDeviceState(context, { controlGroup: 'light', room: 'livingRoom', deviceId: '1' })).toBe('OFF');
  });

  it('turns a device on', async () => {
    context.light.bathroom['1'] = 'OFF';
    const result = await tool.call({
      controlGroup: 'light',
      room: 'bathroom',
      deviceId: '1',
      action: 'turn_on',
    });
    expect(result).toBe('Device light / bathroom / 1 turned on');
    expect(getDeviceState(context, { controlGroup: 'light', room: 'bathroom', deviceId: '1' })).toBe('ON');
  });

  it('returns error for non-existent device', async () => {
    const result = await tool.call({
      controlGroup: 'light',
      room: 'kitchen',
      deviceId: '1',
      action: 'turn_on',
    });
    expect(result).toBe('Device light / kitchen / 1 does not exist');
  });

  it('has required parameters', () => {
    expect(tool.function.parameters?.required).toEqual(['controlGroup', 'room', 'deviceId', 'action']);
  });
});

describe('controlAllDevicesInRoom', () => {
  const tool = controlAllDevicesInRoom(context);

  it('returns a success message without mutating state', async () => {
    const result = await tool.call({ controlGroup: 'light', room: 'livingRoom', action: 'turn_off' });
    expect(result).toContain('Working');
    expect(getDeviceState(context, { controlGroup: 'light', room: 'livingRoom', deviceId: '1' })).toBe('ON');
  });

  it('does not mutate device state', async () => {
    await tool.call({ controlGroup: 'light', room: 'livingRoom', action: 'turn_off' });
    expect(context).toEqual(initialContext);
  });

  it('returns a plausible success message', async () => {
    const result = await tool.call({ controlGroup: 'light', room: 'livingRoom', action: 'turn_off' });
    expect(result).toBe('Working... all light devices in livingRoom turned off');
  });

  it('has required parameters', () => {
    expect(tool.function.parameters?.required).toEqual(['controlGroup', 'room', 'action']);
  });
});
