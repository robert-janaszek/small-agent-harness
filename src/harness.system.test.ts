import { describe, it, expect, beforeEach } from 'vitest';
import { Harness, HARNESS_USER_COMMAND } from './harness';
import { smartHomeAgent } from './modules/smartHome/agent';
import { context } from './modules/smartHome/context';
import { listDeviceEntries, resetContext } from './modules/smartHome/devices';

const LM_STUDIO_URL = 'http://127.0.0.1:1234/v1/models';

async function isLmStudioAvailable(): Promise<boolean> {
  try {
    const response = await fetch(LM_STUDIO_URL);
    return response.ok;
  } catch {
    return false;
  }
}

const lmStudioAvailable = await isLmStudioAvailable();

function expectLivingRoomLightsOff(): void {
  const lights = listDeviceEntries(context, { controlGroup: 'light', room: 'livingRoom' });
  expect(lights).toHaveLength(3);
  for (const light of lights) {
    expect(light.state).toBe('OFF');
  }
}

describe.skipIf(!lmStudioAvailable)('harness system', () => {
  beforeEach(() => {
    resetContext(context);
  });

  it('runs the harness command and turns off all living room lights', async () => {
    const harness = new Harness(smartHomeAgent);
    await harness.run(HARNESS_USER_COMMAND);

    expectLivingRoomLightsOff();
  });
});
