import { describe, it, expect } from 'vitest';

import type { YamlRepairContext } from '../../modules/yamlRepair/context';
import { grepTool } from '../../modules/yamlRepair/grep.tool';
import { readTool } from '../../modules/yamlRepair/read.tool';
import { replaceTool } from '../../modules/yamlRepair/replace.tool';
import { undoTool } from '../../modules/yamlRepair/undo.tool';
import { yamlParseTool } from '../../modules/yamlRepair/yamlParse.tool';
import { createContext as createHomeContext } from '../../modules/smartHome/context';
import { controlAc } from '../../modules/smartHome/controlAc.tool';
import { controlAllDevicesInRoom } from '../../modules/smartHome/controlAllDevicesInRoom.tool';
import { controlDevice } from '../../modules/smartHome/controlDevice.tool';
import { getAcStatus } from '../../modules/smartHome/getAcStatus.tool';
import { getDeviceStatus } from '../../modules/smartHome/getDeviceStatus.tool';
import { listDevices } from '../../modules/smartHome/listDevices.tool';
import { setAcTemperatureTool } from '../../modules/smartHome/setAcTemperature.tool';
import { createContext as createWizardContext } from '../../modules/virtualWizard/context';
import { nextStepTool } from '../../modules/virtualWizard/nextStep.tool';
import { previousStepTool } from '../../modules/virtualWizard/previousStep.tool';
import { resetWizardTool } from '../../modules/virtualWizard/resetWizard.tool';
import { validateCurrentStepTool } from '../../modules/virtualWizard/validateCurrentStep.tool';
import { formatToolActivity, indexToolActivity } from './toolActivity';

const yamlContext = {} as YamlRepairContext;
const homeContext = createHomeContext();
const wizardContext = createWizardContext();

const tools = [
  grepTool(yamlContext),
  readTool(yamlContext),
  replaceTool(yamlContext),
  undoTool(yamlContext),
  yamlParseTool(yamlContext),
  listDevices(homeContext),
  getDeviceStatus(homeContext),
  controlDevice(homeContext),
  controlAllDevicesInRoom(homeContext),
  controlAc(homeContext),
  getAcStatus(homeContext),
  setAcTemperatureTool(homeContext),
  validateCurrentStepTool(wizardContext),
  nextStepTool(wizardContext),
  previousStepTool(wizardContext),
  resetWizardTool(wizardContext),
];

const activities = indexToolActivity(tools);

function format(name: string, args: unknown, status: 'running' | 'done'): string {
  return formatToolActivity(name, args, status, activities.get(name));
}

describe('formatToolActivity', () => {
  it('uses calling/called when the tool has no activity', () => {
    expect(formatToolActivity('echo', { text: 'hi' }, 'running')).toBe('calling echo');
    expect(formatToolActivity('echo', { text: 'hi' }, 'done')).toBe('called echo');
  });

  it.each([
    ['grep', { pattern: 'TODO' }, 'grepping "TODO"', 'grepped "TODO"'],
    ['read', { offset: 12, limit: 8 }, 'reading lines 12-19', 'read lines 12-19'],
    ['replace', { old_string: 'foo: bar' }, 'replacing "foo: bar"', 'replaced "foo: bar"'],
    ['undo', {}, 'undoing', 'undid'],
    ['yamlParse', {}, 'parsing YAML', 'parsed YAML'],
    ['listDevices', {}, 'listing devices', 'listed devices'],
    [
      'listDevices',
      { stateFilter: 'ON', controlGroup: 'light', room: 'livingRoom' },
      'listing ON light in livingRoom',
      'listed ON light in livingRoom',
    ],
    [
      'getDeviceStatus',
      { controlGroup: 'light', room: 'livingRoom', deviceId: '1' },
      'getting status of light 1 in livingRoom',
      'got status of light 1 in livingRoom',
    ],
    [
      'controlDevice',
      { controlGroup: 'light', room: 'kitchen', deviceId: '2', action: 'turn_on' },
      'turning on light 2 in kitchen',
      'turned on light 2 in kitchen',
    ],
    [
      'controlDevice',
      { controlGroup: 'TV', room: 'livingRoom', deviceId: '1', action: 'turn_off' },
      'turning off TV 1 in livingRoom',
      'turned off TV 1 in livingRoom',
    ],
    [
      'controlAllDevicesInRoom',
      { controlGroup: 'light', room: 'kitchen', action: 'turn_off' },
      'turning off light in kitchen',
      'turned off light in kitchen',
    ],
    [
      'controlAc',
      { room: 'bedroom', deviceId: '1', action: 'turn_on' },
      'turning on AC 1 in bedroom',
      'turned on AC 1 in bedroom',
    ],
    [
      'getAcStatus',
      { room: 'livingRoom', deviceId: '1' },
      'getting AC status of AC 1 in livingRoom',
      'got AC status of AC 1 in livingRoom',
    ],
    [
      'setAcTemperature',
      { room: 'livingRoom', deviceId: '1', temperature: 22 },
      'setting AC 1 in livingRoom to 22°C',
      'set AC 1 in livingRoom to 22°C',
    ],
    [
      'validateCurrentStep',
      { name: 'Ada', email: 'a@b.c', plan: 'pro' },
      'validating name=Ada email=a@b.c plan=pro',
      'validated name=Ada email=a@b.c plan=pro',
    ],
    ['nextStep', {}, 'advancing', 'advanced'],
    ['previousStep', {}, 'going back', 'went back'],
    ['resetWizard', {}, 'resetting wizard', 'reset wizard'],
  ] as const)('%s present/past with target', (name, args, running, done) => {
    expect(format(name, args, 'running')).toBe(running);
    expect(format(name, args, 'done')).toBe(done);
  });

  it('truncates long quoted targets and keeps the quotes', () => {
    const pattern = 'a'.repeat(40);
    expect(format('grep', { pattern }, 'running')).toBe(`grepping "${'a'.repeat(31)}…"`);
    expect(format('replace', { old_string: pattern }, 'done')).toBe(
      `replaced "${'a'.repeat(31)}…"`,
    );
  });
});
