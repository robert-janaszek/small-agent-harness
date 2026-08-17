import { ToolContext } from '../../tools/types';
import { initialContext } from './devices';

export function createContext(initialState?: ToolContext): ToolContext {
  return structuredClone(initialState ?? initialContext);
}

export function snapshotHomeState(context: ToolContext): ToolContext {
  return structuredClone(context);
}
