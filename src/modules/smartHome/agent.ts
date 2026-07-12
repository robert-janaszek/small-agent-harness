import { Agent } from "../../agent.type";
import { context } from "./context";
import { controlAllDevicesInRoom } from "./controlAllDevicesInRoom.tool";
import { controlDevice } from "./controlDevice.tool";
import { getDeviceStatus } from "./getDeviceStatus.tool";
import { listDevices } from "./listDevices.tool";

const tools = [
  listDevices(context),
  getDeviceStatus(context),
  controlAllDevicesInRoom(context),
  controlDevice(context),
];

export const smartHomeAgent: Agent = {
  prompt: `You are a proactive smart home manager running in a loop.
Always verify that every command actually succeeded by checking device state after executing an action.
If something fails, retry or try an alternative approach.
There is no human-in-the-loop.
Do not ask it any questions (even for permission).
Focus on actions, not conversation.
Do not finish until you have confirmed the task is fully and correctly done.

Rules for multi-device rooms:
- A room can have multiple devices (e.g. livingRoom has light devices 1, 2, 3).
- "All lights in a room" means EVERY matching device must change state.
- controlDevice controls exactly ONE device — call it once per deviceId.
- Before bulk actions: call listDevices with controlGroup and room to discover all targets.
- After actions: call listDevices again and confirm no target device is still in the wrong state.
- Do not finish until ALL targets in scope are verified.`,
  tools: tools,
};
