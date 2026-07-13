import { ToolContext } from '../../types';
import { formatDeviceLabel, initialContext, listDeviceEntries } from './devices';

export function createContext(initialState?: ToolContext): ToolContext {
  return structuredClone(initialState ?? initialContext);
}

export function createPrintContext(context: ToolContext): () => void {
  return () => {
    const rooms = new Map<string, string[]>();
    for (const entry of listDeviceEntries(context)) {
      if (!rooms.has(entry.room)) rooms.set(entry.room, []);
      const indicator = entry.state === 'ON' ? '\x1b[32m●\x1b[0m' : '\x1b[31m●\x1b[0m';
      rooms.get(entry.room)!.push(`${indicator} ${formatDeviceLabel(entry)}`);
    }
    const line = Array.from(rooms.values())
      .map((group) => group.join('  '))
      .join('     ');
    console.log(`  ${line}`);
  };
}
