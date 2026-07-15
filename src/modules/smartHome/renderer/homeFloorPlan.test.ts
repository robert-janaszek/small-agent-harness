import { describe, it, expect } from 'vitest';

import { applyContextDelta, createHomeState } from './homeState';
import { powerIndicator, renderHomePanel } from './homeFloorPlan';

describe('powerIndicator', () => {
  it('uses green filled dot for ON and red hollow dot for OFF', () => {
    expect(powerIndicator('binary', 'ON')).toEqual({ ch: '●', fg: 32 });
    expect(powerIndicator('binary', 'OFF')).toEqual({ ch: '○', fg: 31 });
  });

  it('uses valve symbols with WV label', () => {
    expect(powerIndicator('valve', 'ON')).toEqual({ ch: '◉', fg: 32 });
    expect(powerIndicator('valve', 'OFF')).toEqual({ ch: '⊗', fg: 31 });
  });
});

describe('renderHomePanel', () => {
  it('shows ON devices with filled indicator', () => {
    const state = createHomeState();
    const panel = renderHomePanel(52, 13, state).join('\n');

    expect(panel).toContain('●1');
    expect(panel).toContain('AC 22 OFF');
    expect(panel).toContain('◉WV');
  });

  it('updates only affected device after context delta', () => {
    const state = createHomeState();
    applyContextDelta(state, [
      { controlGroup: 'light', room: 'livingRoom', deviceId: '1', value: 'OFF' },
    ]);

    const panel = renderHomePanel(52, 13, state).join('\n');
    expect(panel).toContain('○1');
    expect(panel).toContain('●2');
  });

  it('shows closed valve with ⊗ when OFF', () => {
    const state = createHomeState();
    applyContextDelta(state, [
      { controlGroup: 'waterValve', room: 'bathroom', deviceId: '1', value: 'OFF' },
    ]);

    const panel = renderHomePanel(52, 13, state).join('\n');
    expect(panel).toContain('⊗WV');
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

    const panel = renderHomePanel(52, 13, state).join('\n');
    expect(panel).toContain('AC 24 ON');
  });
});
