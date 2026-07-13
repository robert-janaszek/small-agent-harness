import { describe, it, expect } from 'vitest';
import { Harness } from './harness';
import { createSmartHomeAgent, SmartHomeAgent } from './modules/smartHome/agent';
import { getAcState, getDeviceState, listDeviceEntries } from './modules/smartHome/devices';

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

function expectLivingRoomLightsOff(agent: SmartHomeAgent): void {
  const lights = listDeviceEntries(agent.context, { controlGroup: 'light', room: 'livingRoom' });
  expect(lights).toHaveLength(4);
  for (const light of lights) {
    expect(light.state).toBe('OFF');
  }
}

function expectLivingRoomAcOnAt(agent: SmartHomeAgent, temperature: number): void {
  const ac = getAcState(agent.context, { room: 'livingRoom', deviceId: '1' });
  expect(ac?.power).toBe('ON');
  expect(ac?.targetTemperature).toBe(temperature);
}

function expectBathroomWaterValveOff(agent: SmartHomeAgent): void {
  expect(getDeviceState(agent.context, { controlGroup: 'waterValve', room: 'bathroom', deviceId: '1' })).toBe('OFF');
  expect(getDeviceState(agent.context, { controlGroup: 'waterValve', room: 'apartment', deviceId: '1' })).toBe('ON');
}

describe.skipIf(!llmApiAvailable)('harness system', () => {
  it('runs the harness command and turns off all living room lights', async () => {
    const agent = createSmartHomeAgent();
    const harness = new Harness(agent);
    await harness.run('turn off all lights in the living room');

    expectLivingRoomLightsOff(agent);
  });

  it('sets living room AC temperature and turns it on', async () => {
    const agent = createSmartHomeAgent();
    const harness = new Harness(agent);
    await harness.run('set the living room air conditioning to 24 degrees and turn it on');

    expectLivingRoomAcOnAt(agent, 24);
  });

  it('turns off the bathroom water valve', async () => {
    const agent = createSmartHomeAgent();
    const harness = new Harness(agent);
    await harness.run('turn off the water valve in the bathroom');

    expectBathroomWaterValveOff(agent);
  });
});
