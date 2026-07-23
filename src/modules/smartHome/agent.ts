import { Agent } from "../../harness/agent.type";
import { ToolContext } from "../../tools/types";
import { createContext, createContextDeltaEmitter, emitContextInit } from "./context";
import { resetContext } from "./devices";
import { controlAc } from "./controlAc.tool";
import { controlAllDevicesInRoom } from "./controlAllDevicesInRoom.tool";
import { controlDevice } from "./controlDevice.tool";
import { getAcStatus } from "./getAcStatus.tool";
import { getDeviceStatus } from "./getDeviceStatus.tool";
import { listDevices } from "./listDevices.tool";
import { setAcTemperatureTool } from "./setAcTemperature.tool";

const SMART_HOME_PROMPT = `You are a proactive smart home manager running in a loop.
Always verify that every command actually succeeded by checking device state after executing an action.
If something fails, retry or try an alternative approach.
There is no human-in-the-loop.
Do not ask any questions (even for permission).
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

export type SmartHomeAgent = Agent & { context: ToolContext };

export function createSmartHomeAgent(initialState?: ToolContext): SmartHomeAgent {
  const context = createContext(initialState);

  return {
    context,
    onSessionStart: () => emitContextInit(context),
    onSessionReset: () => {
      resetContext(context);
      emitContextInit(context);
    },
    onToolRound: createContextDeltaEmitter(context),
    prompt: SMART_HOME_PROMPT,
    tools: [
      listDevices(context),
      getDeviceStatus(context),
      getAcStatus(context),
      controlAllDevicesInRoom(context),
      controlDevice(context),
      controlAc(context),
      setAcTemperatureTool(context),
    ],
  };
}
