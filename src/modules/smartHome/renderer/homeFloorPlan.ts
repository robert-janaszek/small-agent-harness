import { FLOOR_PLAN_TEMPLATE } from './homeFloorPlan.template';
import { ToolContext } from '../../../tools/types';
import { getDevicePower, isAcState } from '../devices';
import { getDeviceValue } from './homeState';

type DeviceSlot = {
  controlGroup: string;
  room: string;
  deviceId: string;
  row: number;
  col: number;
  label: string;
  kind: 'binary' | 'ac' | 'valve';
};

export const DEVICE_SLOTS: DeviceSlot[] = [
  { controlGroup: 'light', room: 'livingRoom', deviceId: '1', row: 2, col: 2, label: '1', kind: 'binary' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: '2', row: 2, col: 5, label: '2', kind: 'binary' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: '3', row: 2, col: 8, label: '3', kind: 'binary' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: 'backlitCeiling', row: 2, col: 11, label: 'BL', kind: 'binary' },
  { controlGroup: 'TV', room: 'livingRoom', deviceId: '1', row: 2, col: 15, label: 'TV', kind: 'binary' },
  { controlGroup: 'ac', room: 'livingRoom', deviceId: '1', row: 3, col: 2, label: 'AC', kind: 'ac' },
  { controlGroup: 'light', room: 'bedroom', deviceId: 'ceiling', row: 2, col: 22, label: 'C', kind: 'binary' },
  { controlGroup: 'light', room: 'bedroom', deviceId: 'backlitWall', row: 2, col: 26, label: 'BW', kind: 'binary' },
  { controlGroup: 'light', room: 'bathroom', deviceId: 'ceiling', row: 6, col: 2, label: 'C', kind: 'binary' },
  { controlGroup: 'light', room: 'bathroom', deviceId: 'mirror', row: 6, col: 6, label: 'M', kind: 'binary' },
  { controlGroup: 'waterValve', room: 'bathroom', deviceId: '1', row: 6, col: 10, label: 'WV', kind: 'valve' },
  { controlGroup: 'light', room: 'kidsRoom', deviceId: '1', row: 6, col: 16, label: '1', kind: 'binary' },
  { controlGroup: 'light', room: 'kidsRoom', deviceId: '2', row: 6, col: 20, label: '2', kind: 'binary' },
  { controlGroup: 'light', room: 'closet', deviceId: '1', row: 6, col: 26, label: '1', kind: 'binary' },
  { controlGroup: 'waterValve', room: 'apartment', deviceId: '1', row: 9, col: 2, label: 'WV', kind: 'valve' },
];

function indicatorFor(value: string | import('../../../tools/types').AcState): string {
  return getDevicePower(value) === 'ON' ? '●' : '○';
}

function patchBinaryLine(line: string, col: number, indicator: string, label: string): string {
  const chars = line.split('');
  chars[col] = indicator;
  const labelStart = col + 1;
  for (let i = 0; i < label.length; i++) {
    if (labelStart + i < chars.length) {
      chars[labelStart + i] = label[i]!;
    }
  }
  return chars.join('');
}

function patchAcLine(line: string, col: number, ac: { power: 'ON' | 'OFF'; targetTemperature: number }): string {
  const text = `AC ${String(ac.targetTemperature).padStart(2, ' ')} ${ac.power}`;
  const chars = line.split('');
  for (let i = 0; i < text.length; i++) {
    if (col + i < chars.length) {
      chars[col + i] = text[i]!;
    }
  }
  return chars.join('');
}

export function renderHomePanel(width: number, height: number, context: ToolContext): string[] {
  const lines = FLOOR_PLAN_TEMPLATE.map((line) => line.padEnd(width).slice(0, width));

  for (const slot of DEVICE_SLOTS) {
    const value = getDeviceValue(context, slot);
    if (value === undefined) continue;

    if (slot.kind === 'ac' && isAcState(value)) {
      lines[slot.row] = patchAcLine(lines[slot.row]!, slot.col, value);
      continue;
    }

    const indicator = indicatorFor(value);
    lines[slot.row] = patchBinaryLine(lines[slot.row]!, slot.col, indicator, slot.label);
  }

  while (lines.length < height) {
    lines.push(''.padEnd(width));
  }

  return lines.slice(0, height).map((line) => line.padEnd(width).slice(0, width));
}
