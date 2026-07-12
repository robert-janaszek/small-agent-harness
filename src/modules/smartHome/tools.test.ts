import { describe, it, expect, beforeEach } from 'vitest';
import { context } from './context';
import { listDevices } from './listDevices.tool';
import { getDeviceStatus } from './getDeviceStatus.tool';
import { controlDevice } from './controlDevice.tool';
import { controlAllDevicesInRoom } from './controAllDevicesInRoom.tool';

const initialDeviceState = {
  'light.livingRoom.1': 'ON',
  'light.livingRoom.2': 'ON',
  'light.livingRoom.3': 'ON',
  'light.bathroom': 'ON',
};

beforeEach(() => {
  context.deviceState = { ...initialDeviceState };
});

describe('listDevices', () => {
  const tool = listDevices(context);

  it('returns all devices when no filter is given', async () => {
    const result = await tool.call({});
    expect(result).toContain('light.livingRoom.1: ON');
    expect(result).toContain('light.livingRoom.2: ON');
    expect(result).toContain('light.livingRoom.3: ON');
    expect(result).toContain('light.bathroom: ON');
  });

  it('filters by ON state', async () => {
    const result = await tool.call({ stateFilter: 'ON' });
    expect(result).toContain('light.livingRoom.1');
    expect(result.split('\n')).toHaveLength(4);
  });

  it('filters by OFF state', async () => {
    const result = await tool.call({ stateFilter: 'OFF' });
    expect(result).toBe('');
  });

  it('has correct function name and description', () => {
    expect(tool.function.name).toBe('list_devices');
    expect(tool.function.description).toBeTruthy();
  });
});

describe('getDeviceStatus', () => {
  const tool = getDeviceStatus(context);

  it('returns status for an existing device', async () => {
    const result = await tool.call({ entityId: 'light.livingRoom.1' });
    expect(result).toBe('ON');
  });

  it('returns error for unknown device with available devices listed', async () => {
    const result = await tool.call({ entityId: 'light.kitchen' });
    expect(result).toContain('Error');
    expect(result).toContain('light.livingRoom.1');
  });

  it('has correct function name', () => {
    expect(tool.function.name).toBe('get_device_status');
  });
});

describe('controlDevice', () => {
  const tool = controlDevice(context);

  it('turns a device off', async () => {
    const result = await tool.call({ entityId: 'light.livingRoom.1', action: 'turn_off' });
    expect(result).toBe('Device light.livingRoom.1 turned off');
    expect(context.deviceState['light.livingRoom.1']).toBe('OFF');
  });

  it('turns a device on', async () => {
    context.deviceState['light.bathroom'] = 'OFF';
    const result = await tool.call({ entityId: 'light.bathroom', action: 'turn_on' });
    expect(result).toBe('Device light.bathroom turned on');
    expect(context.deviceState['light.bathroom']).toBe('ON');
  });

  it('returns error for non-existent device', async () => {
    const result = await tool.call({ entityId: 'light.kitchen', action: 'turn_on' });
    expect(result).toBe('Device light.kitchen does not exist');
  });

  it('has required parameters', () => {
    expect(tool.function.parameters?.required).toEqual(['entityId', 'action']);
  });
});

describe('controlAllDevicesInRoom', () => {
  const tool = controlAllDevicesInRoom(context);

  it('returns a success message without mutating state', async () => {
    const result = await tool.call({ room: 'livingRoom', action: 'turn_off' });
    expect(result).toContain('livingRoom');
    expect(result).toContain('off');
    expect(context.deviceState['light.livingRoom.1']).toBe('ON');
  });

  it('does not mutate device state', async () => {
    await tool.call({ room: 'livingRoom', action: 'turn_off' });
    expect(context.deviceState).toEqual(initialDeviceState);
  });

  it('returns a plausible success message', async () => {
    const result = await tool.call({ room: 'livingRoom', action: 'turn_off' });
    expect(result).toBe('Working... all devices in livingRoom turned off');
  });

  it('has required parameters', () => {
    expect(tool.function.parameters?.required).toEqual(['room', 'action']);
  });
});
