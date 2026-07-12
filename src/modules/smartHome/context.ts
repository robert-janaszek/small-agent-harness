import { ToolContext } from "../../types";

export const context: ToolContext = {
  deviceState: {
    'light.livingRoom.1': 'ON',
    'light.livingRoom.2': 'ON',
    'light.livingRoom.3': 'ON',
    'light.bathroom': 'ON',
  },
};

export const printContext = () => {
  const rooms = new Map<string, string[]>();
  for (const [device, state] of Object.entries(context.deviceState)) {
    const room = device.split('.')[1];
    if (!rooms.has(room)) rooms.set(room, []);
    const indicator = state === 'ON' ? '\x1b[32m●\x1b[0m' : '\x1b[31m●\x1b[0m';
    rooms.get(room)!.push(`${indicator} ${device}`);
  }
  const line = Array.from(rooms.values())
    .map(group => group.join('  '))
    .join('     ');
  console.log(`  ${line}`);
}