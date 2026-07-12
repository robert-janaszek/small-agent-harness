import { Agent } from "../agent.type";
import { context } from "./context";
import { controlAllDevicesInRoom } from "./controAllDevicesInRoom.tool";
import { controlDevice } from "./controlDevice.tool";
import { getDeviceStatus } from "./getDeviceStatus.tool";
import { listDevices } from "./listDevices.tool";

const tools = [
  getDeviceStatus(context),
  controlAllDevicesInRoom(context),
  listDevices(context),
  controlDevice(context),
]

export const smartHomeAgent: Agent = {
  prompt: `You are a proactive smart home manager running in a loop.
Always verify that every command actually succeeded by checking device state after executing an action.
If something fails, retry or try an alternative approach.
There is no human-in-the-loop.
Do not ask it any questions (even for permission).
Focus on actions, not conversation.
Do not finish until you have confirmed the task is fully and correctly done.`,
  tools: tools
};
