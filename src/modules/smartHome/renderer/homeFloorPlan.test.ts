import { describe, it, expect } from 'vitest';

import { applyContextDelta, createHomeState } from './homeState';
import { renderHomePanel } from './homeFloorPlan';

describe('renderHomePanel', () => {
  it('shows ON devices with filled indicator', () => {
    const state = createHomeState();
    const panel = renderHomePanel(35, 11, state).join('\n');

    expect(panel).toContain('●1');
    expect(panel).toContain('AC 22 OFF');
  });

  it('updates only affected device after context delta', () => {
    const state = createHomeState();
    applyContextDelta(state, [
      { controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' },
    ]);

    const panel = renderHomePanel(35, 11, state).join('\n');
    expect(panel).toContain('○1');
    expect(panel).toContain('●2');
  });

  it('updates AC temperature display', () => {
    const state = createHomeState();
    applyContextDelta(state, [
      {
        controlGroup: 'ac',
        room: 'livingRoom',
        deviceId: '1',
        value: { power: 'ON', targetTemperature: 24 },
      },
    ]);

    const panel = renderHomePanel(35, 11, state).join('\n');
    expect(panel).toContain('AC 24 ON');
  });
});
