import { describe, it, expect, beforeEach } from 'vitest';
import { context } from './context';
import { listDevices } from './listDevices.tool';
import { getDeviceStatus } from './getDeviceStatus.tool';
import { controlDevice } from './controlDevice.tool';
import { controlAllDevicesInRoom } from './controlAllDevicesInRoom.tool';
import { controlAc } from './controlAc.tool';
import { setAcTemperatureTool } from './setAcTemperature.tool';
import { getAcStatus } from './getAcStatus.tool';
import { getDeviceState, getAcState, initialContext, resetContext } from './devices';

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
    expect(result).toContain('light / livingRoom / backlitCeiling: ON');
    expect(result).toContain('light / bathroom / ceiling: ON');
    expect(result).toContain('light / bathroom / mirror: ON');
    expect(result).toContain('light / kidsRoom / 1: ON');
    expect(result).toContain('light / bedroom / ceiling: ON');
    expect(result).toContain('light / closet / 1: ON');
    expect(result).toContain('ac / livingRoom / 1: OFF, target 22°C');
    expect(result).toContain('TV / livingRoom / 1: OFF');
    expect(result).toContain('waterValve / bathroom / 1: ON');
    expect(result).toContain('waterValve / apartment / 1: ON');
  });

  it('filters by ON state', async () => {
    const result = await tool.call({ stateFilter: 'ON' });
    expect(result).toContain('light / livingRoom / 1');
    expect(result.split('\n')).toHaveLength(13);
  });

  it('filters by OFF state', async () => {
    const result = await tool.call({ stateFilter: 'OFF' });
    expect(result).toBe('ac / livingRoom / 1: OFF, target 22°C\nTV / livingRoom / 1: OFF');
  });

  it('filters by controlGroup and room', async () => {
    const result = await tool.call({ controlGroup: 'light', room: 'livingRoom' });
    expect(result).toBe(
      'light / livingRoom / 1: ON\nlight / livingRoom / 2: ON\nlight / livingRoom / 3: ON\nlight / livingRoom / backlitCeiling: ON',
    );
  });

  it('filters by controlGroup, room and state', async () => {
    context.light.livingRoom['1'] = 'OFF';
    const result = await tool.call({ controlGroup: 'light', room: 'livingRoom', stateFilter: 'ON' });
    expect(result).toBe(
      'light / livingRoom / 2: ON\nlight / livingRoom / 3: ON\nlight / livingRoom / backlitCeiling: ON',
    );
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
    context.light.bathroom.ceiling = 'OFF';
    const result = await tool.call({
      controlGroup: 'light',
      room: 'bathroom',
      deviceId: 'ceiling',
      action: 'turn_on',
    });
    expect(result).toBe('Device light / bathroom / ceiling turned on');
    expect(getDeviceState(context, { controlGroup: 'light', room: 'bathroom', deviceId: 'ceiling' })).toBe('ON');
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

describe('controlAc', () => {
  const tool = controlAc(context);

  it('turns AC on', async () => {
    const result = await tool.call({ room: 'livingRoom', deviceId: '1', action: 'turn_on' });
    expect(result).toBe('AC unit ac / livingRoom / 1 turned on');
    expect(getAcState(context, { room: 'livingRoom', deviceId: '1' })?.power).toBe('ON');
  });

  it('turns AC off', async () => {
    context.ac.livingRoom['1'] = { power: 'ON', targetTemperature: 22 };
    const result = await tool.call({ room: 'livingRoom', deviceId: '1', action: 'turn_off' });
    expect(result).toBe('AC unit ac / livingRoom / 1 turned off');
    expect(getAcState(context, { room: 'livingRoom', deviceId: '1' })?.power).toBe('OFF');
  });

  it('returns error for non-existent unit', async () => {
    const result = await tool.call({ room: 'bedroom', deviceId: '1', action: 'turn_on' });
    expect(result).toBe('AC unit ac / bedroom / 1 does not exist');
  });
});

describe('setAcTemperature', () => {
  const tool = setAcTemperatureTool(context);

  it('sets target temperature', async () => {
    const result = await tool.call({ room: 'livingRoom', deviceId: '1', temperature: 24 });
    expect(result).toBe('AC unit ac / livingRoom / 1 target temperature set to 24°C');
    expect(getAcState(context, { room: 'livingRoom', deviceId: '1' })?.targetTemperature).toBe(24);
  });

  it('rejects temperature out of range', async () => {
    const result = await tool.call({ room: 'livingRoom', deviceId: '1', temperature: 10 });
    expect(result).toBe('Temperature must be between 16 and 30°C');
  });
});

describe('getAcStatus', () => {
  const tool = getAcStatus(context);

  it('returns power and target temperature', async () => {
    const result = await tool.call({ room: 'livingRoom', deviceId: '1' });
    expect(result).toBe('power: OFF, targetTemperature: 22°C');
  });

  it('returns error for non-existent unit', async () => {
    const result = await tool.call({ room: 'bedroom', deviceId: '1' });
    expect(result).toBe('AC unit ac / bedroom / 1 does not exist');
  });
});

describe('AC guardrails on binary tools', () => {
  it('rejects controlDevice for AC', async () => {
    const result = await controlDevice(context).call({
      controlGroup: 'ac',
      room: 'livingRoom',
      deviceId: '1',
      action: 'turn_on',
    });
    expect(result).toBe('Error: Use controlAc for AC units instead of controlDevice');
  });

  it('rejects getDeviceStatus for AC', async () => {
    const result = await getDeviceStatus(context).call({
      controlGroup: 'ac',
      room: 'livingRoom',
      deviceId: '1',
    });
    expect(result).toBe('Error: Use getAcStatus for AC units instead of getDeviceStatus');
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
