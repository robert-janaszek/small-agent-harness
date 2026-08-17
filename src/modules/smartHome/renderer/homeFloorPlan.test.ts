import { describe, it, expect } from 'vitest';

import { colors } from '../../../cli/tui/colors';
import { setAcPower, setAcTemperature, setDeviceState } from '../devices';
import { createHomeState } from './homeState';
import { powerIndicator, renderHomePanel } from './homeFloorPlan';

describe('powerIndicator', () => {
  it('uses green filled dot for ON and red hollow dot for OFF', () => {
    expect(powerIndicator('binary', 'ON')).toEqual({ ch: '●', fg: colors.success });
    expect(powerIndicator('binary', 'OFF')).toEqual({ ch: '○', fg: colors.error });
  });

  it('uses valve symbols with WV label', () => {
    expect(powerIndicator('valve', 'ON')).toEqual({ ch: '◉', fg: colors.success });
    expect(powerIndicator('valve', 'OFF')).toEqual({ ch: '⊗', fg: colors.error });
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

  it('updates only affected device after a state change', () => {
    const state = createHomeState();
    setDeviceState(state, { controlGroup: 'light', room: 'livingRoom', deviceId: '1' }, 'OFF');

    const panel = renderHomePanel(52, 13, state).join('\n');
    expect(panel).toContain('○1');
    expect(panel).toContain('●2');
  });

  it('shows closed valve with ⊗ when OFF', () => {
    const state = createHomeState();
    setDeviceState(state, { controlGroup: 'waterValve', room: 'bathroom', deviceId: '1' }, 'OFF');

    const panel = renderHomePanel(52, 13, state).join('\n');
    expect(panel).toContain('⊗WV');
  });

  it('updates AC temperature display', () => {
    const state = createHomeState();
    setAcPower(state, { room: 'livingRoom', deviceId: '1' }, 'ON');
    setAcTemperature(state, { room: 'livingRoom', deviceId: '1' }, 24);

    const panel = renderHomePanel(52, 13, state).join('\n');
    expect(panel).toContain('AC 24 ON');
  });
});
