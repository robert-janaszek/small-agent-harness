import type { AnsiColor } from '../../../cli/tui/diffTerminal';
import type { DiffTerminal } from '../../../cli/tui/diffTerminal';
import { AcState, ToolContext } from '../../../tools/types';
import { getDevicePower, isAcState } from '../devices';
import { FLOOR_PLAN_HEIGHT, FLOOR_PLAN_TEMPLATE } from './homeFloorPlan.template';
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
  { controlGroup: 'light', room: 'livingRoom', deviceId: '1', row: 2, col: 3, label: '1', kind: 'binary' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: '2', row: 2, col: 8, label: '2', kind: 'binary' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: '3', row: 2, col: 13, label: '3', kind: 'binary' },
  { controlGroup: 'light', room: 'livingRoom', deviceId: 'backlitCeiling', row: 2, col: 18, label: 'BL', kind: 'binary' },
  { controlGroup: 'TV', room: 'livingRoom', deviceId: '1', row: 2, col: 24, label: 'TV', kind: 'binary' },
  { controlGroup: 'ac', room: 'livingRoom', deviceId: '1', row: 4, col: 3, label: 'AC', kind: 'ac' },
  { controlGroup: 'light', room: 'bedroom', deviceId: 'ceiling', row: 2, col: 33, label: 'C', kind: 'binary' },
  { controlGroup: 'light', room: 'bedroom', deviceId: 'backlitWall', row: 2, col: 42, label: 'BW', kind: 'binary' },
  { controlGroup: 'light', room: 'bathroom', deviceId: 'ceiling', row: 7, col: 3, label: 'C', kind: 'binary' },
  { controlGroup: 'light', room: 'bathroom', deviceId: 'mirror', row: 7, col: 9, label: 'M', kind: 'binary' },
  { controlGroup: 'waterValve', room: 'bathroom', deviceId: '1', row: 7, col: 15, label: 'WV', kind: 'valve' },
  { controlGroup: 'light', room: 'kidsRoom', deviceId: '1', row: 7, col: 22, label: '1', kind: 'binary' },
  { controlGroup: 'light', room: 'kidsRoom', deviceId: '2', row: 7, col: 28, label: '2', kind: 'binary' },
  { controlGroup: 'light', room: 'closet', deviceId: '1', row: 7, col: 42, label: '1', kind: 'binary' },
  { controlGroup: 'waterValve', room: 'apartment', deviceId: '1', row: 11, col: 3, label: 'WV', kind: 'valve' },
];

export type PowerIndicator = { ch: string; fg: AnsiColor };

export function powerIndicator(kind: DeviceSlot['kind'], power: 'ON' | 'OFF'): PowerIndicator {
  if (kind === 'valve') {
    return power === 'ON'
      ? { ch: '◉', fg: 32 }
      : { ch: '⊗', fg: 31 };
  }

  return power === 'ON'
    ? { ch: '●', fg: 32 }
    : { ch: '○', fg: 31 };
}

function patchBinaryLine(line: string, col: number, indicator: PowerIndicator, label: string): string {
  const chars = line.split('');
  chars[col] = indicator.ch;
  if (label.length > 0) {
    for (let i = 0; i < label.length; i++) {
      if (col + 1 + i < chars.length) {
        chars[col + 1 + i] = label[i]!;
      }
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

    const indicator = powerIndicator(slot.kind, getDevicePower(value));
    lines[slot.row] = patchBinaryLine(lines[slot.row]!, slot.col, indicator, slot.label);
  }

  while (lines.length < height) {
    lines.push(''.padEnd(width));
  }

  return lines.slice(0, height).map((line) => line.padEnd(width).slice(0, width));
}

export function paintHomePanel(
  terminal: DiffTerminal,
  startCol: number,
  width: number,
  height: number,
  context: ToolContext,
): void {
  const panelHeight = Math.min(height, FLOOR_PLAN_HEIGHT);
  const lines = FLOOR_PLAN_TEMPLATE.map((line) => line.padEnd(width).slice(0, width));

  for (let row = 0; row < panelHeight; row++) {
    terminal.fill(row, startCol, lines[row] ?? '');
  }

  for (const slot of DEVICE_SLOTS) {
    const value = getDeviceValue(context, slot);
    if (value === undefined || slot.row >= panelHeight) continue;

    if (slot.kind === 'ac' && isAcState(value)) {
      const dot = powerIndicator('binary', value.power);
      terminal.setChar(slot.row, startCol + slot.col, dot.ch, dot.fg);
      terminal.fill(
        slot.row,
        startCol + slot.col + 1,
        `AC ${String(value.targetTemperature).padStart(2, ' ')} ${value.power}`,
      );
      continue;
    }

    const indicator = powerIndicator(slot.kind, getDevicePower(value));
    terminal.setChar(slot.row, startCol + slot.col, indicator.ch, indicator.fg);
    if (slot.label.length > 0) {
      terminal.fill(slot.row, startCol + slot.col + 1, slot.label);
    }
  }
}
