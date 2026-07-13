import { describe, it, expect, beforeEach } from 'vitest';
import { Harness } from './harness';
import { smartHomeAgent } from './modules/smartHome/agent';
import { context } from './modules/smartHome/context';
import { getAcState, getDeviceState, listDeviceEntries, resetContext } from './modules/smartHome/devices';

import { openaiModelsUrl } from './harness.config';

async function isLlmApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(openaiModelsUrl);
    return response.ok;
  } catch {
    return false;
  }
}

const llmApiAvailable = await isLlmApiAvailable();

function expectLivingRoomLightsOff(): void {
  const lights = listDeviceEntries(context, { controlGroup: 'light', room: 'livingRoom' });
  expect(lights).toHaveLength(4);
  for (const light of lights) {
    expect(light.state).toBe('OFF');
  }
}

function expectLivingRoomAcOnAt(temperature: number): void {
  const ac = getAcState(context, { room: 'livingRoom', deviceId: '1' });
  expect(ac?.power).toBe('ON');
  expect(ac?.targetTemperature).toBe(temperature);
}

function expectBathroomWaterValveOff(): void {
  expect(getDeviceState(context, { controlGroup: 'waterValve', room: 'bathroom', deviceId: '1' })).toBe('OFF');
  expect(getDeviceState(context, { controlGroup: 'waterValve', room: 'apartment', deviceId: '1' })).toBe('ON');
}

describe.skipIf(!llmApiAvailable)('harness system', () => {
  beforeEach(() => {
    resetContext(context);
  });

  it('runs the harness command and turns off all living room lights', async () => {
    const harness = new Harness(smartHomeAgent);
    await harness.run('turn off all lights in the living room');

    expectLivingRoomLightsOff();
  });

  it('sets living room AC temperature and turns it on', async () => {
    const harness = new Harness(smartHomeAgent);
    await harness.run('set the living room air conditioning to 24 degrees and turn it on');

    expectLivingRoomAcOnAt(24);
  });

  it('turns off the bathroom water valve', async () => {
    const harness = new Harness(smartHomeAgent);
    await harness.run('turn off the water valve in the bathroom');

    expectBathroomWaterValveOff();
  });
});
