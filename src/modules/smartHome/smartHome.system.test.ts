import { describe, it, expect } from 'vitest';

import { getHarnessConfig, getOpenaiModelsUrl } from '../../core/config';
import { Harness, type HarnessRunResult } from '../../core/harness';
import { getAcState, getDeviceState, listDeviceEntries } from './devices';
import { createSmartHomeModule, type SmartHomeModule } from './module';

async function isLlmApiAvailable(): Promise<boolean> {
  try {
    const response = await fetch(getOpenaiModelsUrl());
    return response.ok;
  } catch {
    return false;
  }
}

const llmApiAvailable = await isLlmApiAvailable();

function expectLivingRoomLightsOff(module: SmartHomeModule): void {
  const lights = listDeviceEntries(module.context, { controlGroup: 'light', room: 'livingRoom' });
  expect(lights).toHaveLength(4);
  for (const light of lights) {
    expect(light.value).toBe('OFF');
  }
}

function expectLivingRoomAcOnAt(module: SmartHomeModule, temperature: number): void {
  const ac = getAcState(module.context, { room: 'livingRoom', deviceId: '1' });
  expect(ac?.power).toBe('ON');
  expect(ac?.targetTemperature).toBe(temperature);
}

function expectBathroomWaterValveOff(module: SmartHomeModule): void {
  expect(getDeviceState(module.context, { controlGroup: 'waterValve', room: 'bathroom', deviceId: '1' })).toBe('OFF');
  expect(getDeviceState(module.context, { controlGroup: 'waterValve', room: 'apartment', deviceId: '1' })).toBe('ON');
}

function expectCompletedHarnessRun(result: HarnessRunResult): void {
  const { maxIterations } = getHarnessConfig();

  expect(result.iterations).toBeGreaterThan(0);
  expect(result.iterations).toBeLessThan(maxIterations);
  expect(result.tokenUsage.total_tokens).toBeGreaterThan(0);
}

describe.skipIf(!llmApiAvailable)('harness system', () => {
  it('runs the harness command and turns off all living room lights', async () => {
    const module = createSmartHomeModule();
    const harness = new Harness({ modules: [module] });
    const result = await harness.run('turn off all lights in the living room');

    expectCompletedHarnessRun(result);
    expectLivingRoomLightsOff(module);
  });

  it('sets living room AC temperature and turns it on', async () => {
    const module = createSmartHomeModule();
    const harness = new Harness({ modules: [module] });
    const result = await harness.run('set the living room air conditioning to 24 degrees and turn it on');

    expectCompletedHarnessRun(result);
    expectLivingRoomAcOnAt(module, 24);
  });

  it('turns off the bathroom water valve', async () => {
    const module = createSmartHomeModule();
    const harness = new Harness({ modules: [module] });
    const result = await harness.run('turn off the water valve in the bathroom');

    expectCompletedHarnessRun(result);
    expectBathroomWaterValveOff(module);
  });
});
