import type { Module, ModulePanel } from '../../core/module';
import type { Tool } from '../../core/tool';
import { acStateSchema, type ToolContext } from '../../tools/types';
import { createContext, snapshotHomeState } from './context';
import { controlAc } from './controlAc.tool';
import { controlAllDevicesInRoom } from './controlAllDevicesInRoom.tool';
import { controlDevice } from './controlDevice.tool';
import { resetContext } from './devices';
import { getAcStatus } from './getAcStatus.tool';
import { getDeviceStatus } from './getDeviceStatus.tool';
import { listDevices } from './listDevices.tool';
import { paintHomePanel } from './renderer/homeFloorPlan';
import { createHomeState } from './renderer/homeState';
import { setAcTemperatureTool } from './setAcTemperature.tool';

export const SMART_HOME_MODULE_ID = 'smartHome';

export const SMART_HOME_PROMPT = `You are a proactive smart home manager running in a loop.
The user issues commands. Execute them with tools.
Never ask the user a question — they cannot read assistant text in this session and cannot answer you.
If a command is ambiguous, pick a reasonable interpretation and act. Do not wait for confirmation or permission.
Final text is a status report of what you did or found, not a question.
Always verify that every command actually succeeded by checking device state after executing an action.
If something fails, retry or try an alternative approach.
Focus on actions, not conversation.
Do not finish until you have confirmed the task is fully and correctly done.

Rules for status and query commands:
- If the user asks a question or asks to check, report, or inspect status, use only read tools:
  listDevices, getDeviceStatus, and getAcStatus.
- Do NOT control devices unless the user explicitly asks to change state
  (turn on/off, set temperature, close/open valve, etc.).
- For occupancy questions such as "is anyone home?", report which devices are ON or OFF.
  Do not turn anything off or on unless explicitly requested.

Rules for multi-device rooms:
- A room can have multiple devices (e.g. livingRoom has lights 1, 2, 3 and backlitCeiling).
- "All lights in a room" means EVERY matching device must change state.
- controlDevice controls exactly ONE binary device — call it once per deviceId.
- Before bulk actions: call listDevices with controlGroup and room to discover all targets.
- After actions: call listDevices again and confirm no target device is still in the wrong state.
- Do not finish until ALL targets in scope are verified.

Rules for air conditioning:
- AC units are not controlled by controlDevice or getDeviceStatus.
- Use controlAc to turn AC on or off.
- Use setAcTemperature to set target temperature.
- Use getAcStatus to verify power and target temperature.

Rules for water valves:
- Water valves are controlled with controlDevice using controlGroup waterValve.
- bathroom and apartment each have a water valve with deviceId 1.
- turn_off closes the valve (state OFF), turn_on opens it (state ON).
- Use getDeviceStatus to verify valve state after acting.`;

export type SmartHomeModule = Module & { context: ToolContext };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDeviceValue(value: unknown): boolean {
  return typeof value === 'string' || acStateSchema.safeParse(value).success;
}

export function isToolContext(payload: unknown): payload is ToolContext {
  if (!isPlainObject(payload) || Object.keys(payload).length === 0) {
    return false;
  }

  for (const rooms of Object.values(payload)) {
    if (!isPlainObject(rooms)) {
      return false;
    }
    for (const devices of Object.values(rooms)) {
      if (!isPlainObject(devices)) {
        return false;
      }
      for (const deviceValue of Object.values(devices)) {
        if (!isDeviceValue(deviceValue)) {
          return false;
        }
      }
    }
  }

  return true;
}

export function createSmartHomePanel(): ModulePanel {
  let state: ToolContext = createHomeState();

  return {
    onEvent(event, payload) {
      if (event === 'state' && isToolContext(payload)) {
        state = payload;
      }
    },
    paint({ terminal, startCol, width, height }) {
      paintHomePanel(terminal, startCol, width, height, state);
    },
  };
}

export function createSmartHomeModule(initialState?: ToolContext): SmartHomeModule {
  const context = createContext(initialState);
  const emitState = (runtime: { emit: (event: string, payload?: unknown) => void }) => {
    runtime.emit('state', snapshotHomeState(context));
  };

  return {
    id: SMART_HOME_MODULE_ID,
    context,
    prompt: SMART_HOME_PROMPT,
    tools: [
      listDevices(context),
      getDeviceStatus(context),
      getAcStatus(context),
      controlAllDevicesInRoom(context),
      controlDevice(context),
      controlAc(context),
      setAcTemperatureTool(context),
    ] as Tool<any>[],
    createPanel: createSmartHomePanel,
    onSessionStart: emitState,
    onSessionReset: (runtime) => {
      resetContext(context);
      emitState(runtime);
    },
    onToolRound: emitState,
  };
}
